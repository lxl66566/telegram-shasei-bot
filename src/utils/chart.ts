/// 根据数据导出 html 图表
export function createChart(data: any) {
  return `<script src="https://code.highcharts.com/highcharts.js"></script>
<script src="https://code.highcharts.com/modules/timeline.js"></script>

<div id="container"></div>

<script>
  // 处理函数，将URL文本转换为链接
  function convertUrlsToLinks(text) {
    const urlRegex = /(https?:\\/\\/[^\\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" class="timeline-link">$1</a>');
  }

  // 计算时间间隔统计（毫秒）
  function calculateIntervals(sortedData) {
    if (sortedData.length < 2) {
      return {
        minInterval: 0,
        maxInterval: 0,
        avgInterval: 0,
      };
    }

    const intervals = [];
    for (let i = 1; i < sortedData.length; i++) {
      const interval = sortedData[i].time - sortedData[i - 1].time;
      intervals.push(interval);
    }

    return {
      minInterval: Math.min(...intervals),
      maxInterval: Math.max(...intervals),
      avgInterval: intervals.reduce((a, b) => a + b, 0) / intervals.length,
    };
  }

  const mappedData = JSON.parse(\`${JSON.stringify(data)}\`)
    .map((item) => {
      return {
        time: new Date(item.time),
        material: item.material ? convertUrlsToLinks(item.material) : item.material,
      };
    })
    .sort((a, b) => {
      return a.time - b.time;
    });

  // 计算间隔统计
  const intervalStats = calculateIntervals(mappedData);
  
  const data = mappedData.map((item) => {
    // 获取本地时区偏移量（毫秒）
    const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
    return {
      x: item.time.getTime() - timezoneOffset, // 调整为本地时区的时间戳
      name: item.time,
      label: item.material,
      description: item.material,
    };
  });
  Highcharts.chart("container", {
    subtitle: {
      text: \`平均间隔：\${(intervalStats.avgInterval / 1000 / 60 / 60).toFixed(2)} 小时<br/>最小间隔：\${(intervalStats.minInterval / 1000 / 60 / 60).toFixed(
        2,
      )} 小时<br/>最大间隔：\${(intervalStats.maxInterval / 1000 / 60 / 60).toFixed(2)} 小时\`,
    },
    chart: {
      // 禁止缩放
      // zooming: {
      //   type: "x",
      // },
      // 禁止拖拽
      panning: false,
      type: "timeline",
      inverted: true,
      events: {
        load: function () {
          // 图表加载后调整高度
          this.setSize(null, this.series[0].points.length * 50);
        },
      },
    },
    xAxis: {
      type: "datetime",
      visible: false,
    },
    yAxis: {
      gridLineWidth: 1,
      title: null,
      labels: {
        enabled: false,
      },
    },
    legend: {
      enabled: false,
    },
    title: {
      text: "射精时间线",
    },
    tooltip: {
      style: {
        width: 300,
      },
    },
    series: [
      {
        dataLabels: {
          allowOverlap: false,
          format:
            '<span style="color:{point.color}">● </span><span ' + 'style="font-weight: bold;" > ' + "{point.x:%Y-%m-%d %H:%M:%S}</span><br/>{point.label}",
        },
        marker: {
          symbol: "circle",
        },
        data: data,
      },
    ],
  });
</script>

<style>
  #container {
    min-width: 400px;
    max-width: auto;
    margin: 0 auto;
    height: auto;
  }

  /* 为时间线图中的链接添加样式 */
  .highcharts-data-label .timeline-link {
    color: #0066cc;
    text-decoration: underline;
    cursor: pointer;
  }

  .highcharts-data-label .timeline-link:hover {
    color: #004499;
  }

  /* 确保数据标签允许指针事件 */
  .highcharts-data-label {
    pointer-events: auto !important;
  }
</style>
`;
}
