pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Guardian Project's own Maven repos — required for tor-android/jtorctl, same as the
        // main unpruuf app (see ../settings.gradle.kts).
        maven { url = uri("https://raw.githubusercontent.com/guardianproject/gpmaven/master") }
        maven { url = uri("https://guardianproject.info/maven") }
    }
}

rootProject.name = "unpruuf-relay"
include(":app")
