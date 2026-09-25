const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");

function withWifiInfoModule(config) {
  config = withMainApplication(config, (config) => {
    const registration = "add(WifiInfoPackage())";
    if (!config.modResults.contents.includes(registration)) {
      config.modResults.contents = config.modResults.contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n              ${registration}`
      );
    }
    return config;
  });

  return withDangerousMod(config, ["android", async (config) => {
    const sourceDirectory = path.join(
      config.modRequest.projectRoot,
      "plugins",
      "wifi-info"
    );
    const targetDirectory = path.join(
      config.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      "com",
      "iroomreserve",
      "mobile"
    );

    fs.mkdirSync(targetDirectory, { recursive: true });
    for (const filename of ["WifiInfoModule.kt", "WifiInfoPackage.kt"]) {
      fs.copyFileSync(
        path.join(sourceDirectory, filename),
        path.join(targetDirectory, filename)
      );
    }

    return config;
  }]);
}

module.exports = withWifiInfoModule;
