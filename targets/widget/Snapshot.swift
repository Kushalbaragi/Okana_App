import Foundation
import SwiftUI
import WidgetKit

// What the widgets show, as left in the shared app group by the app (see
// utils/widgetSnapshot.js and utils/widgetBridge.js). This mirrors
// resolveWidgetSnapshot there: a widget can be drawn long after the app last wrote
// the snapshot, so a new day shifts the daily bars along and a new month starts
// the month total over.

let appGroup = "group.com.kushalbaragi.okana"
let snapshotKey = "okana_widget_snapshot"
let widgetDays = 30

struct GoalSnapshot: Codable, Hashable {
  let name: String
  let saved: Double
  let target: Double

  var percent: Int {
    target > 0 ? min(100, Int((saved / target * 100).rounded())) : 0
  }
}

private struct StoredSnapshot: Codable {
  var signedIn: Bool
  var monthKey: String?
  var spent: Double?
  var budget: Double?
  var daysEnd: String?
  var days: [Double]?
  var goals: [GoalSnapshot]?
}

struct WidgetData {
  let monthLabel: String
  let spent: Double
  let budget: Double?
  let days: [Double]
  let goals: [GoalSnapshot]

  var daysTotal: Double { days.reduce(0, +) }

  static let sample = WidgetData(
    monthLabel: "September",
    spent: 27450,
    budget: 40000,
    days: [820, 0, 450, 1200, 300, 0, 2100, 640, 380, 0, 900, 1500, 260, 700, 0, 420, 1800, 350, 0, 610, 980, 240, 0, 1300, 520, 310, 1240, 640, 900, 740],
    goals: [
      GoalSnapshot(name: "Goa trip", saved: 31000, target: 50000),
      GoalSnapshot(name: "Laptop", saved: 42000, target: 120000),
      GoalSnapshot(name: "Emergency fund", saved: 18000, target: 100000),
    ]
  )

  // nil when there is nothing to show: never written, or signed out.
  static func load(now: Date = Date()) -> WidgetData? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let stored = try? JSONDecoder().decode(StoredSnapshot.self, from: Data(json.utf8)),
      stored.signedIn,
      let storedDays = stored.days,
      let daysEnd = stored.daysEnd
    else { return nil }

    let calendar = Calendar.current
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"

    var days = storedDays
    if let end = parser.date(from: daysEnd) {
      let gap = calendar.dateComponents([.day], from: calendar.startOfDay(for: end), to: calendar.startOfDay(for: now)).day ?? 0
      let shift = min(max(gap, 0), widgetDays)
      if shift > 0 { days = Array(days.dropFirst(shift)) + Array(repeating: 0, count: shift) }
    }

    let monthKey = DateFormatter()
    monthKey.locale = Locale(identifier: "en_US_POSIX")
    monthKey.dateFormat = "yyyy-MM"
    let monthName = DateFormatter()
    monthName.locale = Locale(identifier: "en_US")
    monthName.dateFormat = "LLLL"

    let sameMonth = stored.monthKey == monthKey.string(from: now)
    return WidgetData(
      monthLabel: monthName.string(from: now),
      spent: sameMonth ? (stored.spent ?? 0) : 0,
      budget: sameMonth ? stored.budget : nil,
      days: days,
      goals: stored.goals ?? []
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
