import SwiftUI
import WidgetKit

// Tapping any widget opens the app (its scheme is "okana", see app.json).
private let openApp = URL(string: "okana://")!

struct MonthSpendWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "OkanaMonthSpend", provider: OkanaProvider()) { entry in
      MonthSpendView(entry: entry)
        .widgetURL(openApp)
        .containerBackground(Theme.background, for: .widget)
    }
    .configurationDisplayName("Month spend")
    .description("What you have spent this month against your budget.")
    .supportedFamilies([.systemSmall])
  }
}

struct GoalWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "OkanaGoal", provider: OkanaProvider()) { entry in
      GoalView(entry: entry)
        .widgetURL(openApp)
        .containerBackground(Theme.background, for: .widget)
    }
    .configurationDisplayName("Savings goal")
    .description("The savings goal closest to done.")
    .supportedFamilies([.systemSmall])
  }
}

struct DailyChartWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "OkanaDailyChart", provider: OkanaProvider()) { entry in
      DailyChartView(entry: entry)
        .widgetURL(openApp)
        .containerBackground(Theme.background, for: .widget)
    }
    .configurationDisplayName("Last 30 days")
    .description("Your spending for each of the last 30 days.")
    .supportedFamilies([.systemMedium])
  }
}

struct GoalsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "OkanaGoals", provider: OkanaProvider()) { entry in
      GoalsView(entry: entry)
        .widgetURL(openApp)
        .containerBackground(Theme.background, for: .widget)
    }
    .configurationDisplayName("All goals")
    .description("Progress on all your savings goals.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

@main
struct OkanaWidgetBundle: WidgetBundle {
  var body: some Widget {
    MonthSpendWidget()
    GoalWidget()
    DailyChartWidget()
    GoalsWidget()
  }
}
