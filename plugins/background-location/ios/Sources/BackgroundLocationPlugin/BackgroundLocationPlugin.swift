import Foundation
import Capacitor
import CoreLocation

@objc(BackgroundLocationPlugin)
public class BackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BackgroundLocationPlugin"
    public let jsName = "BackgroundLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAuthSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAuthSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
    ]

    private let store = SessionStore()
    private lazy var writer = SupabaseLocationWriter(store: store)
    private let manager = CLLocationManager()
    private var pendingPermissionCall: CAPPluginCall?

    public override func load() {
        manager.delegate = self
        manager.pausesLocationUpdatesAutomatically = true
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 50
        if store.isTrackingEnabled && store.hasSession {
            beginUpdates()
        }
    }

    @objc func setAuthSession(_ call: CAPPluginCall) {
        guard
            let access = call.getString("accessToken"),
            let userId = call.getString("userId"),
            let url = call.getString("supabaseUrl"),
            let anon = call.getString("supabaseAnonKey")
        else {
            call.reject("accessToken, userId, supabaseUrl, and supabaseAnonKey are required")
            return
        }
        store.saveSession(
            accessToken: access,
            refreshToken: call.getString("refreshToken"),
            userId: userId,
            supabaseUrl: url,
            anonKey: anon
        )
        call.resolve(["stored": true])
    }

    @objc func clearAuthSession(_ call: CAPPluginCall) {
        stopUpdates()
        store.clearSession()
        call.resolve(["cleared": true])
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            pendingPermissionCall = call
            manager.requestWhenInUseAuthorization()
            return
        }
        if status == .authorizedWhenInUse {
            pendingPermissionCall = call
            manager.requestAlwaysAuthorization()
            return
        }
        call.resolve(statusPayload())
    }

    @objc func startTracking(_ call: CAPPluginCall) {
        guard store.hasSession else {
            call.reject("Call setAuthSession before startTracking")
            return
        }
        let status = manager.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else {
            call.reject("Location permission not granted")
            return
        }
        store.isTrackingEnabled = true
        beginUpdates()
        call.resolve(["tracking": true])
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        store.isTrackingEnabled = false
        stopUpdates()
        call.resolve(["tracking": false])
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    private func beginUpdates() {
        if manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
    }

    private func stopUpdates() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
    }

    private func statusPayload() -> [String: Any] {
        [
            "tracking": store.isTrackingEnabled,
            "hasSession": store.hasSession,
            "permission": permissionLabel(),
        ]
    }

    private func permissionLabel() -> String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse, pendingPermissionCall != nil {
            manager.requestAlwaysAuthorization()
            return
        }
        if let call = pendingPermissionCall {
            pendingPermissionCall = nil
            call.resolve(statusPayload())
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard store.isTrackingEnabled, let loc = locations.last else { return }
        guard writer.shouldUpload(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude) else { return }
        writer.upload(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracyM: loc.horizontalAccuracy)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        CAPLog.print("BackgroundLocation error: \(error.localizedDescription)")
    }
}
