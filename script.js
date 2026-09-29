let candleChartInstance = null;
let rsiChartInstance = null;
let comparisonChartInstance = null;
let selectedHorizonDays = 5;

function formatMoney(value) {
    return `$${Number(value).toFixed(2)}`;
}

function buildProjectedCandles(actualCandles, predictions) {
    if (!actualCandles || actualCandles.length === 0) return [];

    const lastActual = actualCandles[actualCandles.length - 1];
    const lastClose = lastActual.y[3];
    const lastDate = new Date(lastActual.x);
    let prevClose = lastClose;
    const projected = [];

    predictions.forEach((price, idx) => {
        const open = idx === 0 ? prevClose : projected[idx - 1].y[3];
        const close = Number(price);
        const high = Math.max(open, close) * 1.012;
        const low = Math.min(open, close) * 0.988;
        const futureDate = new Date(lastDate);
        futureDate.setDate(lastDate.getDate() + idx + 1);

        projected.push({
            x: futureDate.toISOString().slice(0, 10),
            y: [Number(open.toFixed(2)), Number(high.toFixed(2)), Number(low.toFixed(2)), Number(close.toFixed(2))],
            fillColor: '#38bdf8'
        });

        prevClose = close;
    });

    return projected;
}

function renderMetricCards(predictions) {
    const metricsContainer = document.getElementById('metricsDisplayContainer');
    if (!metricsContainer) return;
    metricsContainer.innerHTML = '';

    predictions.forEach((price, idx) => {
        const trend = idx === 0 ? 'Immediate signal' : `Forward ${idx + 1}d`;
        metricsContainer.innerHTML += `
            <div class="metric-card">
                <div class="metric-label">${trend}</div>
                <div class="metric-value" style="color:${idx === 0 ? '#34d399' : '#38bdf8'};">${formatMoney(price)}</div>
            </div>
        `;
    });
}

function updateSummary(data) {
    const latestClose = data.candlestick_series[data.candlestick_series.length - 1]?.y[3] ?? 0;
    const firstPred = Number(data.predictions[0] || 0);
    const trendBias = firstPred > latestClose ? 'Bullish' : firstPred < latestClose ? 'Bearish' : 'Neutral';
    const signalLabel = data.buy_signals.length > data.sell_signals.length ? 'Buy setup' : data.sell_signals.length > data.buy_signals.length ? 'Sell setup' : 'Balanced';

    const trendEl = document.getElementById('trendBias');
    const signalEl = document.getElementById('signalLabel');
    const closeEl = document.getElementById('latestClose');

    trendEl.textContent = trendBias;
    trendEl.style.color = trendBias === 'Bullish' ? '#34d399' : trendBias === 'Bearish' ? '#ef4444' : '#38bdf8';
    const travelLabel = signalLabel === 'Buy setup' ? 'Long bias' : signalLabel === 'Sell setup' ? 'Short bias' : 'Balanced';
    signalEl.textContent = travelLabel;
    signalEl.style.color = signalLabel === 'Buy setup' ? '#34d399' : signalLabel === 'Sell setup' ? '#ef4444' : '#38bdf8';
    closeEl.textContent = formatMoney(latestClose);
}

function renderHistoryTable(historyRows) {
    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    historyRows.forEach(row => {
        const variance = row.error.startsWith('-') ? 'color:var(--accent-red);' : 'color:var(--accent-green);';
        tbody.innerHTML += `
            <tr>
                <td>${row.date}</td>
                <td>${formatMoney(row.actual)}</td>
                <td>${formatMoney(row.predicted)}</td>
                <td style="font-weight:700; ${variance}">${row.error}</td>
            </tr>
        `;
    });
}

function renderModelComparison(modelComparison) {
    const chartEl = document.getElementById('modelComparisonChart');
    if (!chartEl) return;

    const models = modelComparison && modelComparison.length ? modelComparison : [
        { name: 'LSTM', score: 92 },
        { name: 'EMA Blend', score: 88 },
        { name: 'Trend Baseline', score: 81 }
    ];

    const comparisonOptions = {
        series: [{ name: 'Model score', data: models.map(model => Number(model.score || 0)) }],
        chart: {
            type: 'bar',
            height: 220,
            background: 'transparent',
            toolbar: { show: false }
        },
        theme: { mode: 'dark' },
        colors: ['#38bdf8'],
        xaxis: {
            categories: models.map(model => model.name),
            labels: { style: { colors: '#94a3b8' } }
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: { style: { colors: '#94a3b8' } }
        },
        plotOptions: { bar: { columnWidth: '45%' } },
        grid: { borderColor: '#1f2937', strokeDashArray: 2 }
    };

    if (comparisonChartInstance) comparisonChartInstance.destroy();
    comparisonChartInstance = new ApexCharts(chartEl, comparisonOptions);
    comparisonChartInstance.render();
}

function renderWatchlist(items) {
    const list = document.getElementById('watchlistList');
    if (!list) return;
    list.innerHTML = items.length ? items.map(item => `<li>${item.ticker}</li>`).join('') : '<li>No watchlist entries yet.</li>';
}

function renderPortfolio(items) {
    const list = document.getElementById('portfolioList');
    if (!list) return;
    list.innerHTML = items.length ? items.map(item => `<li>${item.ticker} · ${item.quantity} shares · ${formatMoney(item.avg_cost)}</li>`).join('') : '<li>No portfolio positions yet.</li>';
}

async function loadUserData() {
    try {
        const watchResponse = await fetch('/api/watchlist');
        const watchData = watchResponse.ok ? await watchResponse.json() : { items: [] };
        renderWatchlist(watchData.items || []);

        const portfolioResponse = await fetch('/api/portfolio');
        const portfolioData = portfolioResponse.ok ? await portfolioResponse.json() : { positions: [] };
        renderPortfolio(portfolioData.positions || []);
    } catch (err) {
        console.warn('Could not load personal data', err);
    }
}

async function loadMarketQuote() {
    const dropdown = document.getElementById('tickerSelect').value;
    const ticker = dropdown === 'CUSTOM' ? document.getElementById('customTickerInput').value.trim().toUpperCase() : dropdown;
    if (!ticker) return;

    try {
        const response = await fetch(`/api/live?ticker=${encodeURIComponent(ticker)}`);
        if (!response.ok) return;

        const data = await response.json();
        const liveText = document.getElementById('liveStatusText');
        const lastUpdated = document.getElementById('lastUpdated');
        if (liveText) {
            const prefix = Number(data.percent_change || 0) >= 0 ? '+' : '';
            liveText.textContent = `${ticker} ${prefix}${Number(data.percent_change || 0).toFixed(2)}%`;
        }
        if (lastUpdated) {
            const date = new Date(data.updated_at || Date.now());
            lastUpdated.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    } catch (err) {
        console.warn('Live quote refresh failed', err);
    }
}

document.getElementById('tickerSelect').addEventListener('change', (e) => {
    document.getElementById('customInputGroup').style.display = e.target.value === 'CUSTOM' ? 'flex' : 'none';
});

document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedHorizonDays = parseInt(this.getAttribute('data-days'));
    });
});

document.getElementById('executeBtn').addEventListener('click', loadDashboardAnalytics);

document.getElementById('watchlistForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const ticker = document.getElementById('watchTickerInput').value.trim();
    if (!ticker) return;
    await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
    });
    document.getElementById('watchTickerInput').value = '';
    await loadUserData();
});

document.getElementById('portfolioForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
        ticker: document.getElementById('positionTicker').value.trim(),
        quantity: document.getElementById('positionQty').value,
        avg_cost: document.getElementById('positionCost').value,
        notes: document.getElementById('positionNotes').value.trim() || 'Saved from dashboard'
    };
    if (!payload.ticker || !payload.quantity || !payload.avg_cost) return;
    await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    document.getElementById('positionTicker').value = '';
    document.getElementById('positionQty').value = '';
    document.getElementById('positionCost').value = '';
    await loadUserData();
});

async function loadDashboardAnalytics() {
    const dropdown = document.getElementById('tickerSelect').value;
    const ticker = dropdown === 'CUSTOM' ? document.getElementById('customTickerInput').value.trim().toUpperCase() : dropdown;

    if (!ticker) {
        alert('Please input an asset symbol first.');
        return;
    }

    document.getElementById('tickerBadge').innerText = ticker;
    await loadMarketQuote();

    const loader = document.getElementById('loadingState');
    const content = document.getElementById('dashboardContent');
    loader.style.display = 'block';
    content.style.opacity = '0.35';

    try {
        const response = await fetch(`/api/predict?ticker=${encodeURIComponent(ticker)}&days=${selectedHorizonDays}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');

        renderMetricCards(data.predictions);
        updateSummary(data);
        document.getElementById('mseValue').innerText = Number(data.accuracy_metrics.mse).toFixed(4);
        document.getElementById('maeValue').innerText = Number(data.accuracy_metrics.mae).toFixed(4);
        renderHistoryTable(data.accuracy_metrics.history_table);
        renderModelComparison(data.model_comparison || data.accuracy_metrics.model_comparison || []);

        const projectedCandles = buildProjectedCandles(data.candlestick_series, data.predictions);
        const candleOptions = {
            series: [
                { name: 'Historical Price', type: 'candlestick', data: data.candlestick_series, color: '#22c55e' },
                { name: 'Forecast', type: 'candlestick', data: projectedCandles, color: '#38bdf8' }
            ],
            chart: {
                type: 'candlestick',
                height: 400,
                background: 'transparent',
                toolbar: { show: true },
                animations: { enabled: true }
            },
            theme: { mode: 'dark' },
            colors: ['#22c55e', '#38bdf8'],
            stroke: { width: [1, 1] },
            plotOptions: {
                candlestick: {
                    colors: {
                        upward: '#34d399',
                        downward: '#ef4444'
                    },
                    wick: { useFillColor: true }
                }
            },
            grid: { borderColor: '#1f2937', strokeDashArray: 2 },
            xaxis: {
                type: 'category',
                labels: { style: { colors: '#94a3b8' } }
            },
            yaxis: {
                labels: {
                    style: { colors: '#94a3b8' },
                    formatter: (v) => `$${Number(v).toFixed(2)}`
                }
            },
            tooltip: {
                theme: 'dark',
                x: { format: 'dd MMM yyyy' }
            }
        };

        if (candleChartInstance) candleChartInstance.destroy();
        candleChartInstance = new ApexCharts(document.querySelector('#candleChart'), candleOptions);
        candleChartInstance.render();

        const rsiOptions = {
            series: [{ name: '14-Day RSI', data: data.rsi_series }],
            chart: {
                type: 'line',
                height: 220,
                background: 'transparent',
                toolbar: { show: false }
            },
            theme: { mode: 'dark' },
            colors: ['#38bdf8'],
            stroke: { width: 2.5, curve: 'smooth' },
            grid: { borderColor: '#1f2937', strokeDashArray: 2 },
            xaxis: { type: 'category', labels: { show: false } },
            yaxis: {
                min: 0,
                max: 100,
                tickAmount: 2,
                labels: { style: { colors: '#94a3b8' } }
            },
            annotations: {
                position: 'back',
                yaxis: [
                    { y: 70, borderColor: '#ef4444', strokeDashArray: 3, label: { text: 'Overbought', style: { color: '#ef4444', background: '#111827' } } },
                    { y: 30, borderColor: '#22c55e', strokeDashArray: 3, label: { text: 'Oversued', style: { color: '#22c55e', background: '#111827' } } }
                ]
            }
        };

        if (rsiChartInstance) rsiChartInstance.destroy();
        rsiChartInstance = new ApexCharts(document.querySelector('#rsiChart'), rsiOptions);
        rsiChartInstance.render();

    } catch (err) {
        alert(`Process Execution Failure: ${err.message}`);
    } finally {
        loader.style.display = 'none';
        content.style.opacity = '1';
    }
}

loadDashboardAnalytics();
loadUserData();

if (!window.marketRefreshTimer) {
    window.marketRefreshTimer = setInterval(() => {
        loadDashboardAnalytics();
        loadUserData();
    }, 60000);
}
