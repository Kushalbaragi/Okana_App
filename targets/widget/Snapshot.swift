import Foundation
import SwiftUI
import WidgetKit

// What the widget shows, as left in the shared app group by the app (see
// utils/widgetSnapshot.js and utils/widgetBridge.js). This mirrors
// resolveWidgetSnapshot there: the widget can be drawn long after the app last
// wrote the snapshot, so a new month starts over at nothing.

let appGroup = "group.com.kushalbaragi.okana"
let snapshotKey = "okana_widget_snapshot"

private struct StoredSnapshot: Codable {
  var signedIn: Bool
  var monthKey: String?
  var spent: Double?
  var month: [Double]?
  var lastMonthSpent: Double?
}

struct WidgetData {
  let monthLabel: String
  let spent: Double
  // This month, one entry per day (day 1 first), and how far into it today is.
  let month: [Double]
  let today: Int
  // All of last month's spend, or nil when there was none to compare against.
  let lastMonthSpent: Double?

  static let sample = WidgetData(
    monthLabel: "September",
    spent: 19190,
    month: [820, 0, 450, 1200, 300, 0, 2100, 640, 380, 0, 900, 1500, 260, 700, 0, 420, 1800, 350, 0, 610, 980, 240, 0, 1300, 520, 0, 0, 0, 0, 0],
    today: 25,
    lastMonthSpent: 25400
  )

  // nil when there is nothing to show: never written, or signed out.
  static func load(now: Date = Date()) -> WidgetData? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let stored = try? JSONDecoder().decode(StoredSnapshot.self, from: Data(json.utf8)),
      stored.signedIn
    else { return nil }

    let calendar = Calendar.current
    let monthKey = DateFormatter()
    monthKey.locale = Locale(identifier: "en_US_POSIX")
    monthKey.dateFormat = "yyyy-MM"
    let monthName = DateFormatter()
    monthName.locale = Locale(identifier: "en_US")
    monthName.dateFormat = "LLLL"

    let sameMonth = stored.monthKey == monthKey.string(from: now)
    // A new month that started while the app stayed closed has nothing in it yet.
    let monthLength = calendar.range(of: .day, in: .month, for: now)?.count ?? 30
    let storedMonth = sameMonth ? (stored.month ?? []) : []
    let month = (0..<monthLength).map { $0 < storedMonth.count ? storedMonth[$0] : 0 }
    return WidgetData(
      monthLabel: monthName.string(from: now),
      spent: sameMonth ? (stored.spent ?? 0) : 0,
      month: month,
      today: calendar.component(.day, from: now),
      // Last month changes when the month does, and only the app knows it.
      lastMonthSpent: sameMonth ? stored.lastMonthSpent : nil
    )
  }
}

struct OkanaEntry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct OkanaProvider: TimelineProvider {
  func placeholder(in context: Context) -> OkanaEntry {
    OkanaEntry(date: Date(), data: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (OkanaEntry) -> Void) {
    completion(OkanaEntry(date: Date(), data: context.isPreview ? .sample : WidgetData.load()))
  }

  // One entry, redrawn by the app whenever its data changes, and here shortly
  // after midnight so the day rolls over even if the app stays closed.
  func getTimeline(in context: Context, completion: @escaping (Timeline<OkanaEntry>) -> Void) {
    let now = Date()
    let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 60 * 60 + 60)
    completion(Timeline(entries: [OkanaEntry(date: now, data: WidgetData.load(now: now))], policy: .after(midnight)))
  }
}

func money(_ value: Double) -> String {
  let formatter = NumberFormatter()
  formatter.numberStyle = .currency
  formatter.locale = Locale(identifier: "en_IN")
  formatter.currencyCode = "INR"
  formatter.maximumFractionDigits = 0
  return formatter.string(from: NSNumber(value: value.rounded())) ?? "₹\(Int(value))"
}
