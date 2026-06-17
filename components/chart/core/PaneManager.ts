import { IChartApi } from 'lightweight-charts';

export class PaneManager {
  private chart: IChartApi;

  constructor(chart: IChartApi) {
    this.chart = chart;
  }

  setupPanes(isDarkMode: boolean) {
    this.chart.applyOptions({
      layout: {
        panes: {
          enableResize: true,
          separatorColor: isDarkMode ? '#2A2E39' : '#E0E3EB',
          separatorHoverColor: isDarkMode ? '#4C7EFF' : '#2962FF'
        }
      }
    });
  }

  setPaneHeights(heights: number[]) {
    try {
      const panes = this.chart.panes();
      panes.forEach((pane, index) => {
        if (heights[index] !== undefined) {
          pane.setHeight(heights[index]);
        }
      });
    } catch (e) {
      console.error('Error setting pane heights:', e);
    }
  }
}
