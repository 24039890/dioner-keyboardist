package expo.modules.dionermidi

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.ParcelUuid
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.Executor

/**
 * Thin wrapper over android.media.midi.
 *
 * It lists MIDI devices that can send data to the phone, opens one, and forwards
 * the raw MIDI bytes to JavaScript. All message parsing (running status,
 * real-time bytes, SysEx, note on/off) happens in TypeScript
 * (src/services/midi/midiParser.ts), where it is unit-tested.
 *
 * USB MIDI and virtual devices are listed by MidiManager directly. Bluetooth LE
 * MIDI devices are found with a BLE scan filtered on the standard MIDI service
 * UUID, then opened with MidiManager.openBluetoothDevice. The JS side requests
 * the runtime permissions (BLUETOOTH_SCAN/CONNECT on Android 12+, location on
 * older versions) before calling the scan.
 */
class DionerMidiModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val mainExecutor = Executor { command -> mainHandler.post(command) }

  private var midiManager: MidiManager? = null
  private var openDevice: MidiDevice? = null
  private var openPorts: MutableList<MidiOutputPort> = mutableListOf()
  private var openDeviceId: Int? = null
  private var callbackRegistered = false
  private var scanCallback: ScanCallback? = null
  private val foundBluetooth = linkedMapOf<String, Map<String, Any?>>()
  private val stopScanRunnable = Runnable { stopScan() }

  private val deviceCallback = object : MidiManager.DeviceCallback() {
    override fun onDeviceAdded(device: MidiDeviceInfo) {
      emitDevices()
    }

    override fun onDeviceRemoved(device: MidiDeviceInfo) {
      if (device.id == openDeviceId) {
        closeCurrent()
        sendEvent("onDeviceError", mapOf("deviceId" to device.id, "reason" to "disconnected"))
      }
      emitDevices()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("DionerMidi")

    Events("onMidiData", "onDevicesChanged", "onDeviceError", "onBluetoothDevicesFound", "onBluetoothScanStopped")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) {
        midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
      }
    }

    OnStartObserving("onDevicesChanged") {
      registerCallback()
    }

    OnStopObserving("onDevicesChanged") {
      unregisterCallback()
    }

    OnDestroy {
      stopScan()
      unregisterCallback()
      closeCurrent()
    }

    /** True when the device has the android.software.midi feature. */
    Function("isSupported") {
      return@Function midiManager != null
    }

    /** Devices with at least one output port (i.e. they can send notes to us). */
    Function("getDevices") {
      return@Function listDevices()
    }

    AsyncFunction("openDevice") { deviceId: Int, promise: Promise ->
      val manager = midiManager
      if (manager == null) {
        promise.reject(CodedException("ERR_MIDI_UNSUPPORTED", "This device does not support MIDI.", null))
        return@AsyncFunction
      }
      val info = allDevices(manager).firstOrNull { it.id == deviceId }
      if (info == null) {
        promise.reject(CodedException("ERR_MIDI_NOT_FOUND", "The MIDI device is no longer connected.", null))
        return@AsyncFunction
      }
      closeCurrent()
      manager.openDevice(info, { device -> attachDevice(device, promise) }, mainHandler)
    }

    /** True when Bluetooth LE is available and switched on. */
    Function("isBluetoothReady") {
      val adapter = bluetoothAdapter() ?: return@Function false
      return@Function adapter.isEnabled
    }

    /** Scans about 15 s for BLE MIDI devices; results arrive as onBluetoothDevicesFound events. */
    AsyncFunction("startBluetoothScan") { promise: Promise ->
      val adapter = bluetoothAdapter()
      if (midiManager == null || adapter == null) {
        promise.reject(CodedException("ERR_BLE_UNSUPPORTED", "This phone does not support Bluetooth MIDI.", null))
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        promise.reject(CodedException("ERR_BLE_OFF", "Turn on Bluetooth to find Bluetooth MIDI keyboards.", null))
        return@AsyncFunction
      }
      try {
        startScan(adapter)
        promise.resolve(null)
      } catch (e: SecurityException) {
        promise.reject(CodedException("ERR_BLE_PERMISSION", "Bluetooth permission was not granted.", e))
      }
    }

    Function("stopBluetoothScan") {
      stopScan()
    }

    AsyncFunction("openBluetoothDevice") { address: String, promise: Promise ->
      val manager = midiManager
      val adapter = bluetoothAdapter()
      if (manager == null || adapter == null) {
        promise.reject(CodedException("ERR_BLE_UNSUPPORTED", "This phone does not support Bluetooth MIDI.", null))
        return@AsyncFunction
      }
      try {
        stopScan()
        closeCurrent()
        val device = adapter.getRemoteDevice(address)
        manager.openBluetoothDevice(device, { midi -> attachDevice(midi, promise) }, mainHandler)
      } catch (e: IllegalArgumentException) {
        promise.reject(CodedException("ERR_BLE_NOT_FOUND", "That Bluetooth device address is not valid.", e))
      } catch (e: SecurityException) {
        promise.reject(CodedException("ERR_BLE_PERMISSION", "Bluetooth permission was not granted.", e))
      }
    }

    Function("closeDevice") {
      closeCurrent()
    }
  }

  /** Opens every output port of an opened device and forwards its bytes; shared by USB and Bluetooth. */
  private fun attachDevice(device: MidiDevice?, promise: Promise) {
    if (device == null) {
      promise.reject(CodedException("ERR_MIDI_OPEN_FAILED", "The MIDI device could not be opened.", null))
      return
    }
    val info = device.info
    val ports = mutableListOf<MidiOutputPort>()
    for (portIndex in 0 until info.outputPortCount) {
      val port = device.openOutputPort(portIndex) ?: continue
      port.connect(ForwardingReceiver(info.id))
      ports.add(port)
    }
    if (ports.isEmpty()) {
      runCatching { device.close() }
      promise.reject(CodedException("ERR_MIDI_NO_PORT", "The MIDI device has no output port that could be opened.", null))
      return
    }
    openDevice = device
    openPorts = ports
    openDeviceId = info.id
    promise.resolve(describe(info))
  }

  private fun bluetoothAdapter(): BluetoothAdapter? =
    (appContext.reactContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  @SuppressLint("MissingPermission") // permissions are requested in JS before scanning
  private fun startScan(adapter: BluetoothAdapter) {
    stopScan()
    val scanner = adapter.bluetoothLeScanner ?: throw SecurityException("Bluetooth LE scanner unavailable")
    foundBluetooth.clear()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device ?: return
        val name = runCatching { device.name }.getOrNull() ?: result.scanRecord?.deviceName ?: "Bluetooth MIDI device"
        foundBluetooth[device.address] = mapOf("address" to device.address, "name" to name, "rssi" to result.rssi)
        sendEvent("onBluetoothDevicesFound", mapOf("devices" to foundBluetooth.values.toList()))
      }

      override fun onScanFailed(errorCode: Int) {
        scanCallback = null
        mainHandler.removeCallbacks(stopScanRunnable)
        sendEvent("onBluetoothScanStopped", mapOf("error" to "Bluetooth scan failed (code " + errorCode + ")."))
      }
    }
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(MIDI_SERVICE_UUID)).build()
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    scanner.startScan(listOf(filter), settings, callback)
    scanCallback = callback
    mainHandler.postDelayed(stopScanRunnable, SCAN_DURATION_MS)
  }

  @SuppressLint("MissingPermission")
  private fun stopScan() {
    mainHandler.removeCallbacks(stopScanRunnable)
    val callback = scanCallback ?: return
    scanCallback = null
    runCatching { bluetoothAdapter()?.bluetoothLeScanner?.stopScan(callback) }
    sendEvent("onBluetoothScanStopped", mapOf("error" to null))
  }

  private companion object {
    /** Standard BLE-MIDI service UUID (MIDI over Bluetooth Low Energy specification). */
    val MIDI_SERVICE_UUID: UUID = UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
    const val SCAN_DURATION_MS = 15_000L
  }

  /** Receives raw bytes on the MIDI thread and forwards them to JS. */
  private inner class ForwardingReceiver(private val deviceId: Int) : MidiReceiver() {
    override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
      if (count <= 0) return
      val bytes = IntArray(count) { i -> msg[offset + i].toInt() and 0xFF }
      sendEvent(
        "onMidiData",
        mapOf(
          "deviceId" to deviceId,
          "bytes" to bytes.toList(),
          // System.nanoTime base, converted to seconds.
          "timestamp" to timestamp / 1_000_000_000.0,
        ),
      )
    }
  }

  @Suppress("DEPRECATION")
  private fun allDevices(manager: MidiManager): List<MidiDeviceInfo> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
    } else {
      manager.devices.toList()
    }
  }

  private fun listDevices(): List<Map<String, Any?>> {
    val manager = midiManager ?: return emptyList()
    return allDevices(manager).filter { it.outputPortCount > 0 }.map { describe(it) }
  }

  private fun describe(info: MidiDeviceInfo): Map<String, Any?> {
    val props = info.properties
    val name = props.getString(MidiDeviceInfo.PROPERTY_NAME)
      ?: listOfNotNull(
        props.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER),
        props.getString(MidiDeviceInfo.PROPERTY_PRODUCT),
      ).joinToString(" ").ifBlank { "MIDI device ${info.id}" }
    val transport = when (info.type) {
      MidiDeviceInfo.TYPE_USB -> "usb"
      MidiDeviceInfo.TYPE_BLUETOOTH -> "bluetooth"
      MidiDeviceInfo.TYPE_VIRTUAL -> "virtual"
      else -> "unknown"
    }
    return mapOf("id" to info.id, "name" to name, "transport" to transport, "outputPorts" to info.outputPortCount)
  }

  private fun emitDevices() {
    sendEvent("onDevicesChanged", mapOf("devices" to listDevices()))
  }

  @Suppress("DEPRECATION")
  private fun registerCallback() {
    val manager = midiManager ?: return
    if (callbackRegistered) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      manager.registerDeviceCallback(MidiManager.TRANSPORT_MIDI_BYTE_STREAM, mainExecutor, deviceCallback)
    } else {
      manager.registerDeviceCallback(deviceCallback, mainHandler)
    }
    callbackRegistered = true
  }

  private fun unregisterCallback() {
    val manager = midiManager ?: return
    if (!callbackRegistered) return
    manager.unregisterDeviceCallback(deviceCallback)
    callbackRegistered = false
  }

  private fun closeCurrent() {
    openPorts.forEach { port -> runCatching { port.close() } }
    openPorts = mutableListOf()
    runCatching { openDevice?.close() }
    openDevice = null
    openDeviceId = null
  }
}
