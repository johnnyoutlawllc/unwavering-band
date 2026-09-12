import Foundation

final class SupabaseLocationWriter {
    private let store: SessionStore
    private let minInterval: TimeInterval = 60
    private let minDistanceM: Double = 50
    private let queue = DispatchQueue(label: "com.johnnyoutlaw.unwaveringband.location-upload")

    init(store: SessionStore) {
        self.store = store
    }

    func shouldUpload(lat: Double, lng: Double) -> Bool {
        guard let lastAt = store.lastUploadAt else { return true }
        if Date().timeIntervalSince(lastAt) >= minInterval { return true }
        guard let prevLat = store.lastLat, let prevLng = store.lastLng else { return true }
        return haversineM(prevLat, prevLng, lat, lng) >= minDistanceM
    }

    func upload(lat: Double, lng: Double, accuracyM: Double) {
        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.uploadSync(lat: lat, lng: lng, accuracyM: accuracyM)
            } catch {
                NSLog("BackgroundLocation upload failed: %@", error.localizedDescription)
            }
        }
    }

    private func uploadSync(lat: Double, lng: Double, accuracyM: Double) throws {
        guard store.hasSession,
              let access = store.accessToken,
              let userId = store.userId,
              let baseRaw = store.supabaseUrl,
              let anon = store.anonKey
        else {
            throw NSError(domain: "BackgroundLocation", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Missing session",
            ])
        }
        let base = baseRaw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let visitedAt = ISO8601DateFormatter().string(from: Date())

        let visit: [String: Any] = [
            "user_id": userId,
            "lat": lat,
            "lng": lng,
            "accuracy_m": accuracyM,
            "visited_at": visitedAt,
        ]
        try request(method: "POST", url: "\(base)/rest/v1/visits", body: visit, access: access, anon: anon)

        let patch: [String: Any?] = [
            "last_lat": lat,
            "last_lng": lng,
            "last_location_accuracy_m": accuracyM,
            "last_location_at": visitedAt,
            "last_lat_cipher": nil,
            "last_lng_cipher": nil,
        ]
        try request(
            method: "PATCH",
            url: "\(base)/rest/v1/users?id=eq.\(userId)",
            body: patch.compactMapValues { $0 },
            access: access,
            anon: anon
        )

        store.rememberUpload(lat: lat, lng: lng, at: Date())
    }

    private func request(method: String, url: String, body: [String: Any], access: String, anon: String) throws {
        guard let endpoint = URL(string: url) else {
            throw NSError(domain: "BackgroundLocation", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Bad URL",
            ])
        }
        var req = URLRequest(url: endpoint)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anon, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization")
        req.setValue("unwavering", forHTTPHeaderField: "Content-Profile")
        req.setValue("unwavering", forHTTPHeaderField: "Accept-Profile")
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        var httpError: Error?
        let task = URLSession.shared.dataTask(with: req) { _, response, error in
            defer { sem.signal() }
            if let error {
                httpError = error
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code < 200 || code >= 300 {
                httpError = NSError(domain: "BackgroundLocation", code: code, userInfo: [
                    NSLocalizedDescriptionKey: "HTTP \(code)",
                ])
            }
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 20)
        if let httpError { throw httpError }
    }

    private func haversineM(_ aLat: Double, _ aLng: Double, _ bLat: Double, _ bLng: Double) -> Double {
        let R = 6_371_000.0
        let dLat = (bLat - aLat) * .pi / 180
        let dLng = (bLng - aLng) * .pi / 180
        let s = sin(dLat / 2) * sin(dLat / 2)
            + cos(aLat * .pi / 180) * cos(bLat * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * R * asin(sqrt(s))
    }
}
