#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Cordova Android APK Build Process"
echo "=========================================="
cd /workspace

# Verify Android platform is added
if [ ! -d "platforms/android" ]; then
    echo "Adding Android platform (cordova-android 13)..."
    cordova platform add android@13.0.0 --save
else
    echo "Android platform already initialized."
fi

echo "Compiling Android APK (Debug build)..."
cordova build android --debug -- --jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=512m"

# Find output APK
APK_CANDIDATE=$(find platforms/android/app/build/outputs/apk -name "*debug.apk" 2>/dev/null | head -n 1)

if [ -n "$APK_CANDIDATE" ] && [ -f "$APK_CANDIDATE" ]; then
    mkdir -p /workspace/output
    cp "$APK_CANDIDATE" /workspace/output/app-debug.apk
    echo ""
    echo "=========================================="
    echo "  BUILD SUCCESSFUL!"
    echo "=========================================="
    echo "Output APK: /workspace/output/app-debug.apk"
    ls -lh /workspace/output/app-debug.apk
    sha256sum /workspace/output/app-debug.apk
    echo "=========================================="
else
    echo "ERROR: Could not find generated debug APK in platforms/android/app/build/outputs/apk"
    exit 1
fi
