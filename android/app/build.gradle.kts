plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Pass -PhubUrl=https://you.github.io/home-hub/ when building (the CI workflow does this).
val hubUrl = (findProperty("hubUrl") as String?) ?: "http://192.168.1.50:5173/"
val keystore: String? = System.getenv("HUB_KEYSTORE")

android {
    namespace = "pt.paul.homehub"
    compileSdk = 35

    defaultConfig {
        applicationId = "pt.paul.homehub"
        minSdk = 25          // Fire OS 6 and newer
        targetSdk = 35
        versionCode = ((findProperty("versionCode") as String?) ?: "1").toInt()
        versionName = "0.1.0"
        buildConfigField("String", "HUB_URL", "\"$hubUrl\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("HUB_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HUB_KEY_ALIAS") ?: "homehub"
                keyPassword = System.getenv("HUB_KEY_PASSWORD") ?: System.getenv("HUB_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Without a keystore the APK is debug-signed: fine for a first install, but
            // updates then need an uninstall. See README "Signing".
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val media3 = "1.6.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-ui:$media3")
}
