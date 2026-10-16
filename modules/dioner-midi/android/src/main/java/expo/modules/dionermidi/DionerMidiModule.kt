package expo.modules.dionermidi

import android.content.Context
import android.content.pm.PackageManager
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
import java.util.concurrent.Executor

/**
 * Thin wrapper over android.media.midi.
 *
 * It lists MIDI devices that can send data to the phone, opens one, and forwards
 * the raw MIDI bytes to JavaScript. All message parsing (running status,
 * real-time bytes, SysEx, note on/off) happens in TypeScript
 * (src/services/midi/midiParser.ts), where it is unit-tested.
 *
 * USB MIDI and virtual devices are supported. Bluetooth LE MIDI needs pairing
 * through MidiManager.openBluetoothDevice and extra permissions; it is not
 * included yet.
 */
class DionerMidiModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val mainExecutor = Executor { command -> mainHandler.post(command) }

  private var midiManager: MidiManager? = null
  private var openDevice: MidiDevice? = null
  private var openPorts: MutableList<MidiOutputPort> = mutableListOf()
  private var openDeviceId: Int? = null
  private var callbackRegistered = false

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

    Events("onMidiData", "onDevicesChanged", "onDeviceError")

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
      manager.openDevice(info, { device ->
        if (device == null) {
          promise.reject(CodedException("ERR_MIDI_OPEN_FAILED", "The MIDI device could not be opened.", null))
          return@openDevice
        }
        val ports = mutableListOf<MidiOutputPort>()
        for (portIndex in 0 until info.outputPortCount) {
          val port = device.openOutputPort(portIndex) ?: continue
          port.connect(ForwardingReceiver(deviceId))
          ports.add(port)
        }
        if (ports.isEmpty()) {
          device.close()
          promise.reject(CodedException("ERR_MIDI_NO_PORT", "The MIDI device has no output port that could be opened.", null))
          return@openDevice
        }
        openDevice = device
        openPorts = ports
        openDeviceId = deviceId
        promise.resolve(describe(info))
      }, mainHandler)
    }

    Function("closeDevice") {
      closeCurrent()
    }
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
