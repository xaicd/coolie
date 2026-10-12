package cloud.coolie.app.security

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecurityGuardModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SecurityGuard"

    @ReactMethod
    fun getSecurityPosture(promise: Promise) {
        try {
            val posture = AppSecurityGuard.inspectPosture(reactContext)
            val map = Arguments.createMap().apply {
                putBoolean("isSignatureValid", posture.isSignatureValid)
                putBoolean("isDebuggerAttached", posture.isDebuggerAttached)
                putBoolean("isInjectionDetected", posture.isInjectionDetected)
                putBoolean("isRooted", posture.isRooted)
                putBoolean("isProxyOrVpnActive", posture.isProxyOrVpnActive)
                putBoolean("isEmulator", posture.isEmulator)
                putString("signatureHash", posture.signatureHash)

                val threatsArray = Arguments.createArray()
                for (threat in posture.activeThreats) {
                    threatsArray.pushString(threat)
                }
                putArray("activeThreats", threatsArray)
                putBoolean("isSecure", posture.activeThreats.isEmpty())
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SECURITY_INSPECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun triggerSelfDestruct() {
        AppSecurityGuard.terminateSelf()
    }
}
