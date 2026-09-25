package com.iroomreserve.mobile

import android.Manifest
import android.content.Context
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WifiInfoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WifiInfoModule"

  @Suppress("DEPRECATION")
  @ReactMethod
  fun getCurrentSsid(promise: Promise) {
    try {
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
        reactApplicationContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) !=
          android.content.pm.PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(null)
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val locationManager =
          reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!locationManager.isLocationEnabled) {
          promise.resolve(null)
          return
        }
      }

      val wifiManager =
        reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      val ssid = wifiManager?.connectionInfo?.ssid
        ?.removePrefix("\"")
        ?.removeSuffix("\"")
        ?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }

      promise.resolve(ssid)
    } catch (error: Exception) {
      promise.reject("WIFI_SSID_ERROR", "Unable to read the connected Wi-Fi network.", error)
    }
  }
}
