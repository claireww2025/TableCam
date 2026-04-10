const path = require("path");

let ffmpegBinaryPath;
try {
  // eslint-disable-next-line global-require
  ffmpegBinaryPath = require("ffmpeg-static");
} catch {
  ffmpegBinaryPath = undefined;
}

const extraResource = [];
if (ffmpegBinaryPath) {
  extraResource.push(ffmpegBinaryPath);
}

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource,
    ignore: [
      /(^|\/)src($|\/)/,
      /(^|\/)release($|\/)/,
      /(^|\/)out($|\/)/,
      /(^|\/)scripts($|\/)/,
      /(^|\/)\.tmp-packager($|\/)/,
      /(^|\/)\.electron-cache($|\/)/,
      /(^|\/)node_modules\/\.cache($|\/)/,
      /(^|\/)public\/.*\.ts$/,
      /(^|\/)tsconfig\.json$/,
      /(^|\/)README(\.md)?$/i
    ],
    // Required on macOS 10.14+ or getUserMedia fails with permission denied (no system prompt text).
    extendInfo: {
      CFBundleDisplayName: "TableCam",
      NSCameraUsageDescription:
        "TableCam uses your camera for the floating preview, optional picture-in-picture in recordings, and virtual backgrounds.",
      NSMicrophoneUsageDescription:
        "TableCam can record microphone audio when you enable it for screen recordings.",
      NSScreenCaptureUsageDescription:
        "TableCam records the desktop region you choose for screen recording."
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {}
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32", "linux"]
    },
    {
      name: "@electron-forge/maker-deb",
      config: {}
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {}
    }
  ]
};
