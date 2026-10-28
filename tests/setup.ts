// Jest has no asset registry for font files (SDK 58), so icon fonts count as already loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
