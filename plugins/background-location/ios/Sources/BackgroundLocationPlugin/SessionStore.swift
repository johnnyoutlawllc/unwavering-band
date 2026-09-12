import Foundation
import Security

final class SessionStore {
    private let service = "com.johnnyoutlaw.unwaveringband.backgroundlocation"
    private let defaults = UserDefaults.standard

    private enum Key {
        static let access = "access_token"
        static let refresh = "refresh_token"
        static let user = "user_id"
        static let url = "supabase_url"
        static let anon = "supabase_anon_key"
        static let tracking = "tracking_enabled"
        static let lastLat = "last_lat"
        static let lastLng = "last_lng"
        static let lastAt = "last_upload_at"
    }

    func saveSession(accessToken: String, refreshToken: String?, userId: String, supabaseUrl: String, anonKey: String) {
        setKeychain(Key.access, accessToken)
        setKeychain(Key.refresh, refreshToken ?? "")
        defaults.set(userId, forKey: Key.user)
        defaults.set(supabaseUrl, forKey: Key.url)
        defaults.set(anonKey, forKey: Key.anon)
    }

    func clearSession() {
        deleteKeychain(Key.access)
        deleteKeychain(Key.refresh)
        defaults.removeObject(forKey: Key.user)
        defaults.removeObject(forKey: Key.url)
        defaults.removeObject(forKey: Key.anon)
        isTrackingEnabled = false
    }

    var hasSession: Bool {
        !(accessToken ?? "").isEmpty
            && !(userId ?? "").isEmpty
            && !(supabaseUrl ?? "").isEmpty
            && !(anonKey ?? "").isEmpty
    }

    var accessToken: String? { getKeychain(Key.access) }
    var userId: String? { defaults.string(forKey: Key.user) }
    var supabaseUrl: String? { defaults.string(forKey: Key.url) }
    var anonKey: String? { defaults.string(forKey: Key.anon) }

    var isTrackingEnabled: Bool {
        get { defaults.bool(forKey: Key.tracking) }
        set { defaults.set(newValue, forKey: Key.tracking) }
    }

    func rememberUpload(lat: Double, lng: Double, at: Date) {
        defaults.set(lat, forKey: Key.lastLat)
        defaults.set(lng, forKey: Key.lastLng)
        defaults.set(at.timeIntervalSince1970, forKey: Key.lastAt)
    }

    var lastUploadAt: Date? {
        let t = defaults.double(forKey: Key.lastAt)
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    var lastLat: Double? {
        defaults.object(forKey: Key.lastLat) == nil ? nil : defaults.double(forKey: Key.lastLat)
    }

    var lastLng: Double? {
        defaults.object(forKey: Key.lastLng) == nil ? nil : defaults.double(forKey: Key.lastLng)
    }

    private func setKeychain(_ account: String, _ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    private func getKeychain(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteKeychain(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
