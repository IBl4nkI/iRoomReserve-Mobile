const { withAndroidManifest } = require("@expo/config-plugins");

const BACKGROUND_ACTIONS_SERVICE =
  "com.asterinet.react.bgactions.RNBackgroundActionsTask";

module.exports = function withBackgroundActionsForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Android application element is missing from the manifest.");
    }

    application.service ??= [];
    let service = application.service.find(
      (item) => item.$?.["android:name"] === BACKGROUND_ACTIONS_SERVICE
    );

    if (!service) {
      service = { $: { "android:name": BACKGROUND_ACTIONS_SERVICE } };
      application.service.push(service);
    }

    service.$["android:foregroundServiceType"] = "connectedDevice";
    return config;
  });
};
