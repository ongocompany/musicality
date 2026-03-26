const { withAppBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin: prebuild 시 release signing config를 자동 주입.
 * 1) signingConfigs에 release 블록 추가
 * 2) buildTypes.release의 signingConfig를 release로 변경
 * 3) ritmo-upload.keystore를 android/app/에 복사
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // release signingConfig가 이미 있으면 스킵
    if (buildGradle.includes("signingConfigs.release")) {
      return config;
    }

    // 1) signingConfigs 블록에 release 추가
    buildGradle = buildGradle.replace(
      /signingConfigs\s*\{(\s*debug\s*\{[^}]*\})\s*\}/,
      `signingConfigs {$1
        release {
            storeFile file('ritmo-upload.keystore')
            storePassword 'ritmo2026upload'
            keyAlias 'ritmo-upload'
            keyPassword 'ritmo2026upload'
        }
    }`
    );

    // 2) buildTypes.release 안의 signingConfig를 debug → release로 변경
    const releaseBlockStart = buildGradle.indexOf('release {', buildGradle.indexOf('buildTypes'));
    if (releaseBlockStart !== -1) {
      const debugRef = buildGradle.indexOf('signingConfigs.debug', releaseBlockStart);
      if (debugRef !== -1) {
        buildGradle =
          buildGradle.slice(0, debugRef) +
          'signingConfigs.release' +
          buildGradle.slice(debugRef + 'signingConfigs.debug'.length);
      }
    }

    // 3) keystore 파일을 android/app/에 복사
    const projectRoot = path.resolve(__dirname, '..');
    const src = path.join(projectRoot, 'ritmo-upload.keystore');
    const dst = path.join(projectRoot, 'android', 'app', 'ritmo-upload.keystore');
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }

    config.modResults.contents = buildGradle;
    return config;
  });
};
