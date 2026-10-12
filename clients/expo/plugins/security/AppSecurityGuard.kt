package cloud.coolie.app.security

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Debug
import android.os.Process
import android.util.Log
import cloud.coolie.app.BuildConfig
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.system.exitProcess

/**
 * AppSecurityGuard — 零信任移动端应用自保护 (RASP) 与防破壳看门狗
 * 
 * 覆盖六大核心防线：
 * 1. 签名防篡改与证书指纹锁定 (SHA-256 白名单比对)
 * 2. 反调试与内核 TracerPid 持续守护
 * 3. 反 Frida 与 /proc/self/maps 内存注入扫描
 * 4. 深度 Root 与提权环境嗅探
 * 5. 反代理与 VPN 抓包中间人嗅探
 * 6. 生产环境致命威胁即时熔断自毁
 */
object AppSecurityGuard {
    private const val TAG = "AppSecurityGuard"

    // 官方出厂证书 SHA-256 指纹白名单 (大写不带冒号)
    // 包含 debug.keystore 与官方生产证书指纹
    private val OFFICIAL_SIGNATURE_HASHES = setOf(
        "FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C", // debug.keystore
        // 生产专用预留签名指纹槽位
        "434034B000000000000000000000000000000000000000000000000000000000"
    )

    // 内存模块注入黑名单关键字
    private val SUSPICIOUS_MAPS_KEYWORDS = arrayOf(
        "frida-agent",
        "frida-gadget",
        "libfrida",
        "xposed.installer",
        "libxposed",
        "edxposed",
        "sandhook",
        "yahfa",
        "libsubstrate",
        "libriru"
    )

    // 常见 su / magisk 提权可执行文件路径
    private val ROOT_PATHS = arrayOf(
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/vendor/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/data/local/su",
        "/system/app/Superuser.apk",
        "/sbin/.magisk",
        "/data/adb/magisk"
    )

    private val watchdogExecutor = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "Coolie-Security-Watchdog").apply { isDaemon = true }
    }

    @Volatile
    private var isInitialized = false

    data class SecurityPosture(
        val isSignatureValid: Boolean,
        val isDebuggerAttached: Boolean,
        val isInjectionDetected: Boolean,
        val isRooted: Boolean,
        val isProxyOrVpnActive: Boolean,
        val isEmulator: Boolean,
        val signatureHash: String,
        val activeThreats: List<String>
    )

    fun init(context: Context) {
        if (isInitialized) return
        isInitialized = true

        Log.i(TAG, "🛡️ Coolie 零信任移动端防破壳 RASP 系统启动初始化...")

        // 立即执行一次启动期安全巡检
        val posture = inspectPosture(context)
        Log.i(TAG, "🛡️ 启动态安全评估: threats=${posture.activeThreats}, isSignatureValid=${posture.isSignatureValid}")

        // 生产包遇致命威胁立即熔断
        if (!BuildConfig.DEBUG && posture.activeThreats.contains("TAMPERED_SIGNATURE")) {
            Log.e(TAG, "🚨 严重安全报警: APK 签名被篡改 (二次打包破壳)！触发自毁！")
            terminateSelf()
        }

        // 启动后台持续看门狗
        startWatchdog(context)
    }

    fun inspectPosture(context: Context): SecurityPosture {
        val sigInfo = getSignatureHash(context)
        val sigValid = OFFICIAL_SIGNATURE_HASHES.any { it.equals(sigInfo, ignoreCase = true) }
        val debugAttached = checkDebuggerAttached()
        val injection = checkDynamicInjection()
        val root = checkRoot()
        val proxyOrVpn = checkProxyOrVpn(context)
        val emulator = checkEmulator()

        val threats = mutableListOf<String>()
        if (!sigValid && !BuildConfig.DEBUG) threats.add("TAMPERED_SIGNATURE")
        if (debugAttached) threats.add("DEBUGGER_ATTACHED")
        if (injection) threats.add("DYNAMIC_INJECTION_DETECTED")
        if (root) threats.add("ROOT_ENVIRONMENT_DETECTED")
        if (proxyOrVpn) threats.add("NETWORK_PROXY_OR_VPN_ACTIVE")
        if (emulator && !BuildConfig.DEBUG) threats.add("SUSPICIOUS_EMULATOR_ENVIRONMENT")

        return SecurityPosture(
            isSignatureValid = sigValid,
            isDebuggerAttached = debugAttached,
            isInjectionDetected = injection,
            isRooted = root,
            isProxyOrVpnActive = proxyOrVpn,
            isEmulator = emulator,
            signatureHash = sigInfo,
            activeThreats = threats
        )
    }

    /**
     * 1. 签名指纹防篡改核验 (SHA-256)
     */
    fun getSignatureHash(context: Context): String {
        return try {
            val pm = context.packageManager
            val packageName = context.packageName
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                packageInfo.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                val packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                packageInfo.signatures
            }

            if (signatures != null && signatures.isNotEmpty()) {
                val cert = signatures[0].toByteArray()
                val md = MessageDigest.getInstance("SHA-256")
                val digest = md.digest(cert)
                digest.joinToString("") { "%02X".format(it) }
            } else {
                "NO_SIGNATURE"
            }
        } catch (e: Exception) {
            Log.e(TAG, "提取签名指纹失败", e)
            "ERROR"
        }
    }

    /**
     * 2. 反调试与内核 TracerPid 巡检
     */
    fun checkDebuggerAttached(): Boolean {
        // 1) 官方 API 检查
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
            return true
        }

        // 2) Linux 内核态 TracerPid 检查 (反 GDB/LLDB/Frida 附加)
        try {
            BufferedReader(FileReader("/proc/self/status")).use { reader ->
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    if (line!!.startsWith("TracerPid:")) {
                        val pidStr = line!!.substring("TracerPid:".length).trim()
                        val tracerPid = pidStr.toIntOrNull() ?: 0
                        if (tracerPid > 0) {
                            Log.w(TAG, "🚨 检测到内核 TracerPid 附加: $tracerPid")
                            return true
                        }
                        break
                    }
                }
            }
        } catch (ignored: Exception) {
        }

        return false
    }

    /**
     * 3. 反 Frida 与内存段危险模块动态注入扫描
     */
    fun checkDynamicInjection(): Boolean {
        try {
            BufferedReader(FileReader("/proc/self/maps")).use { reader ->
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    for (keyword in SUSPICIOUS_MAPS_KEYWORDS) {
                        if (line!!.contains(keyword, ignoreCase = true)) {
                            Log.w(TAG, "🚨 检测到内存可疑注入模块: $keyword")
                            return true
                        }
                    }
                }
            }
        } catch (ignored: Exception) {
        }
        return false
    }

    /**
     * 4. 深度 Root 与提权环境嗅探
     */
    fun checkRoot(): Boolean {
        // 1) 检查 su/magisk 可执行文件是否存在
        for (path in ROOT_PATHS) {
            if (File(path).exists()) {
                return true
            }
        }

        // 2) 检查 build.prop 是否为 test-keys
        val buildTags = Build.TAGS
        if (buildTags != null && buildTags.contains("test-keys")) {
            return true
        }

        return false
    }

    /**
     * 5. 反代理与 VPN 抓包中间人嗅探
     */
    fun checkProxyOrVpn(context: Context): Boolean {
        // 1) 检查系统 HTTP 代理
        val proxyHost = System.getProperty("http.proxyHost")
        val proxyPort = System.getProperty("http.proxyPort")
        if (!proxyHost.isNullOrBlank() && proxyPort != null) {
            return true
        }

        // 2) 检查网络接口是否为 VPN (TUN/TAP 虚拟抓包网卡)
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val activeNetwork = cm?.activeNetwork
            val capabilities = cm?.getNetworkCapabilities(activeNetwork)
            if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                return true
            }
        } catch (ignored: Exception) {
        }

        return false
    }

    /**
     * 6. 模拟器识别 (区分生产与开发模式)
     */
    fun checkEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")
                || "google_sdk" == Build.PRODUCT)
    }

    /**
     * 启动后台看门狗 (每 3 秒巡检一次内存注入与调试挂载)
     */
    private fun startWatchdog(context: Context) {
        watchdogExecutor.scheduleWithFixedDelay({
            try {
                if (checkDebuggerAttached()) {
                    Log.w(TAG, "🚨 看门狗报警: 检测到调试器挂载！")
                    if (!BuildConfig.DEBUG) {
                        terminateSelf()
                    }
                }
                if (checkDynamicInjection()) {
                    Log.w(TAG, "🚨 看门狗报警: 检测到内存 Frida/Hook 注入！")
                    if (!BuildConfig.DEBUG) {
                        terminateSelf()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "看门狗巡检异常", e)
            }
        }, 3, 3, TimeUnit.SECONDS)
    }

    /**
     * 生产遇攻击自毁退出 (使反编译人员无法 Dump 内存)
     */
    fun terminateSelf() {
        Log.e(TAG, "💥 [Zero-Trust Defense] 触发安全熔断自毁！")
        try {
            Process.killProcess(Process.myPid())
        } finally {
            exitProcess(-1)
        }
    }
}
