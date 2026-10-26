import SwiftUI
import WidgetKit

// Tapping any widget opens the app (its scheme is "okana", see app.json).
private let openApp = URL(string: "okana://")!

struct DailyChartWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "OkanaDailyChart", provider: OkanaProvider()) { entry in
      // Its own, tighter margins instead of the system's, so the chart is as big as
      // it can be.
      DailyChartView(entry: entry)
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 14, trailing: 14))
        .widgetURL(openApp)
        .containerBackground(Theme.background, for: .widget)
    }
    .configurationDisplayName("This month")
    .description("This month's spending, day by day, against last month.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

@main
struct OkanaWidgetBundle: WidgetBundle {
  var body: some Widget {
    DailyChartWidget()
  }
}
