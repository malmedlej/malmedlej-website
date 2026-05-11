const DEFAULTS = {
    capacity: 80000,
    cost: 39.5,
    margin: 15,
    floor: 40,
    ceiling: 85,
    utilization: 40
};

const SCENARIOS = {
    custom: { name: "Custom / Current" },
    low: { name: "Low Utilization", utilization: 20 },
    high: { name: "High Utilization", utilization: 90 },
    optimized: { name: "Optimized Structure", floor: 40, ceiling: 85, margin: 15, utilization: 85 }
};

let activeScenario = "custom";

function byId(id) {
    return document.getElementById(id);
}

function numberValue(id, fallback = 0) {
    const value = parseFloat(byId(id).value);
    return Number.isFinite(value) ? value : fallback;
}

function formatNumber(num, digits = 0) {
    if (!Number.isFinite(num)) return "0";
    return num.toLocaleString("en-SA", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatCurrency(num) {
    return formatNumber(Math.round(num));
}

function formatPrice(num) {
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-SA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatPercent(num) {
    if (!Number.isFinite(num)) return "0.0%";
    return `${num.toFixed(1)}%`;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getInputs() {
    return {
        floor: numberValue("floor", DEFAULTS.floor),
        ceiling: numberValue("ceiling", DEFAULTS.ceiling),
        utilization: numberValue("utilization", DEFAULTS.utilization),
        margin: numberValue("margin", DEFAULTS.margin),
        capacity: numberValue("capacity", DEFAULTS.capacity),
        cost: numberValue("cost", DEFAULTS.cost)
    };
}

function setField(id, value) {
    byId(id).value = value;
}

function syncPair(sliderId, numberId, value) {
    setField(sliderId, value);
    setField(numberId, value);
}

function syncAllInputs(values) {
    syncPair("floor", "floorVal", values.floor);
    syncPair("ceiling", "ceilingVal", values.ceiling);
    syncPair("utilization", "utilizationVal", values.utilization);
    syncPair("margin", "marginVal", values.margin);
    setField("capacity", values.capacity);
    setField("cost", values.cost);
}

function sanitizeInputs(sourceId) {
    const raw = getInputs();
    const warnings = [];

    const clean = {
        floor: clamp(raw.floor, 0, 100),
        ceiling: clamp(raw.ceiling, 0, 100),
        utilization: clamp(raw.utilization, 0, 100),
        margin: Math.max(0, raw.margin),
        capacity: Math.max(1, raw.capacity),
        cost: Math.max(0.01, raw.cost)
    };

    if (clean.utilization !== raw.utilization) warnings.push("Utilization must be between 0% and 100%.");
    if (clean.margin !== raw.margin) warnings.push("Margin % cannot be below 0%.");
    if (clean.capacity !== raw.capacity) warnings.push("Total Capacity must be greater than 0.");
    if (clean.cost !== raw.cost) warnings.push("Cost per Pallet must be greater than 0.");

    if (clean.ceiling < clean.floor) {
        if (sourceId === "floor" || sourceId === "floorVal") {
            clean.ceiling = clean.floor;
            warnings.push("Ceiling % was raised to match Floor %.");
        } else {
            clean.floor = clean.ceiling;
            warnings.push("Floor % was lowered to match Ceiling %.");
        }
    }

    syncAllInputs(clean);
    showValidation(warnings);
    return clean;
}

function showValidation(warnings) {
    const message = byId("validationMessage");
    if (warnings.length) {
        message.textContent = warnings.join(" ");
        message.hidden = false;
    } else {
        message.hidden = true;
        message.textContent = "";
    }
}

function calculate(values) {
    const utilization = clamp(values.utilization, 0, 100);
    const floor = clamp(values.floor, 0, 100);
    const ceiling = clamp(values.ceiling, 0, 100);
    const margin = Math.max(0, values.margin);
    const capacity = Math.max(1, values.capacity);
    const costPerPallet = Math.max(0.01, values.cost);

    const floorPallets = Math.round(capacity * floor / 100);
    const ceilingPallets = Math.round(capacity * ceiling / 100);
    const actualUsedPallets = Math.round(capacity * utilization / 100);
    const chargedPallets = Math.min(Math.max(actualUsedPallets, floorPallets), ceilingPallets);
    const sellingPrice = costPerPallet * (1 + margin / 100);
    const revenue = chargedPallets * sellingPrice;
    const totalCost = actualUsedPallets * costPerPallet;
    const profit = revenue - totalCost;
    const actualMargin = revenue > 0 ? profit / revenue * 100 : 0;
    const unbilledAboveCeiling = Math.max(actualUsedPallets - ceilingPallets, 0);
    const revenueLeakage = unbilledAboveCeiling * sellingPrice;

    return {
        utilization,
        floor,
        ceiling,
        margin,
        capacity,
        costPerPallet,
        floorPallets,
        ceilingPallets,
        actualUsedPallets,
        chargedPallets,
        sellingPrice,
        revenue,
        totalCost,
        profit,
        actualMargin,
        unbilledAboveCeiling,
        revenueLeakage
    };
}

function highUtilizationResult(values) {
    return calculate({ ...values, utilization: 90 });
}

function riskStatus(result) {
    if (result.profit < 0 || result.unbilledAboveCeiling > 0) return "High";
    if (result.actualMargin < 10 || result.utilization >= result.ceiling) return "Caution";
    return "Low";
}

function statusClass(status) {
    if (status === "High") return "risk";
    if (status === "Caution") return "warning";
    return "positive";
}

function setKpiClass(id, status) {
    const card = byId(id);
    card.classList.remove("positive", "warning", "negative", "risk", "neutral");
    card.classList.add(status);
}

function updateKpis(result, highResult) {
    byId("sellingPrice").textContent = formatPrice(result.sellingPrice);
    byId("revenue").textContent = formatCurrency(result.revenue);
    byId("costDisplay").textContent = formatCurrency(result.totalCost);
    byId("profit").textContent = formatCurrency(result.profit);
    byId("actualMargin").textContent = formatPercent(result.actualMargin);
    byId("chargedPallets").textContent = formatNumber(result.chargedPallets);
    byId("chargedSubtext").textContent = `floor ${formatNumber(result.floorPallets)} | ceiling ${formatNumber(result.ceilingPallets)}`;
    byId("actualUsedPallets").textContent = formatNumber(result.actualUsedPallets);
    byId("unbilled").textContent = formatNumber(result.unbilledAboveCeiling);
    byId("revenueLeakage").textContent = formatCurrency(result.revenueLeakage);

    const risk = riskStatus(highResult);
    byId("highUtilizationRisk").textContent = risk;
    byId("riskSubtext").textContent = `90% profit ${formatCurrency(highResult.profit)} SAR`;

    setKpiClass("profitCard", result.profit < 0 ? "negative" : "positive");
    setKpiClass("marginCard", result.actualMargin < 0 ? "negative" : result.actualMargin < 10 ? "warning" : "positive");
    setKpiClass("unbilledCard", result.unbilledAboveCeiling > 0 ? "warning" : "neutral");
    setKpiClass("leakageCard", result.revenueLeakage > 0 ? "warning" : "neutral");
    setKpiClass("riskCard", statusClass(risk));
}

function updateCapacityBand(result) {
    const floorPct = clamp(result.floor, 0, 100);
    const actualPct = clamp(result.utilization, 0, 100);
    const ceilingPct = clamp(result.ceiling, 0, 100);
    const visibleActual = Math.min(actualPct, ceilingPct);
    const overage = Math.max(actualPct - ceilingPct, 0);

    byId("bandCommitted").style.width = `${floorPct}%`;
    byId("bandUsed").style.left = "0%";
    byId("bandUsed").style.width = `${visibleActual}%`;
    byId("bandUsed").classList.toggle("within", actualPct >= floorPct && actualPct <= ceilingPct);
    byId("bandOverage").style.left = `${ceilingPct}%`;
    byId("bandOverage").style.width = `${overage}%`;
    byId("floorMarker").style.left = `${floorPct}%`;
    byId("actualMarker").style.left = `${actualPct}%`;
    byId("ceilingMarker").style.left = `${ceilingPct}%`;
    byId("floorBandLabel").textContent = `Floor: ${formatPercent(floorPct)}`;
    byId("actualBandLabel").textContent = `Actual: ${formatPercent(actualPct)}`;
    byId("ceilingBandLabel").textContent = `Ceiling: ${formatPercent(ceilingPct)}`;

    const status = byId("bandStatus");
    status.className = "status-pill";
    if (actualPct > ceilingPct) {
        status.textContent = "Above Ceiling";
        status.classList.add("high");
    } else if (actualPct < floorPct) {
        status.textContent = "Below Floor";
        status.classList.add("caution");
    } else {
        status.textContent = "Within Band";
        status.classList.add("acceptable");
    }
}

function scenarioValues(base, key) {
    if (key === "custom") return { ...base };
    if (key === "low") return { ...base, utilization: 20 };
    if (key === "high") return { ...base, utilization: 90 };
    return { ...base, floor: 40, ceiling: 85, margin: 15, utilization: 85 };
}

function scenarioExplanation(key, result) {
    if (key === "low") return "Low utilization benefits from floor billing while cost follows actual usage.";
    if (key === "high") return result.unbilledAboveCeiling > 0
        ? "High usage exceeds the billing ceiling, creating unbilled usage."
        : "High usage remains within the commercial ceiling.";
    if (key === "optimized") return "Optimized structure tests a 40% floor, 85% ceiling, and 15% margin.";
    return "Current manual inputs are reflected in the model.";
}

function updateScenarioTable(values) {
    const rows = [
        ["Utilization %", result => formatPercent(result.utilization)],
        ["Actual Used Pallets", result => formatNumber(result.actualUsedPallets)],
        ["Charged Pallets", result => formatNumber(result.chargedPallets)],
        ["Revenue", result => `${formatCurrency(result.revenue)} SAR`],
        ["Cost", result => `${formatCurrency(result.totalCost)} SAR`],
        ["Profit", result => `${formatCurrency(result.profit)} SAR`],
        ["Margin %", result => formatPercent(result.actualMargin)],
        ["Risk Status", result => riskStatus(result)]
    ];
    const keys = ["custom", "low", "high", "optimized"];
    const results = keys.map(key => calculate(scenarioValues(values, key)));
    const body = byId("scenarioBody");

    body.innerHTML = "";
    rows.forEach(([label, formatter]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("td");
        th.textContent = label;
        tr.appendChild(th);

        results.forEach(result => {
            const td = document.createElement("td");
            td.textContent = formatter(result);
            tr.appendChild(td);
        });

        body.appendChild(tr);
    });

    const activeIndex = keys.indexOf(activeScenario);
    const selectedKey = activeIndex >= 0 ? activeScenario : "custom";
    const selected = results[activeIndex >= 0 ? activeIndex : 0];
    const selectedRisk = riskStatus(selected);

    byId("insightName").textContent = SCENARIOS[selectedKey].name;
    byId("insightProfit").textContent = `${formatCurrency(selected.profit)} SAR`;
    byId("insightMargin").textContent = formatPercent(selected.actualMargin);
    byId("insightRisk").textContent = selectedRisk;
    byId("insightText").textContent = scenarioExplanation(selectedKey, selected);
}

function updateSensitivityTable(values) {
    const margins = [5, 10, 15, 20, 25, 30];
    const ceilings = [70, 75, 80, 85, 90, 95, 100];
    const body = byId("sensitivityBody");
    body.innerHTML = "";

    margins.forEach(margin => {
        const tr = document.createElement("tr");
        const rowLabel = document.createElement("td");
        rowLabel.textContent = `${margin}%`;
        tr.appendChild(rowLabel);

        ceilings.forEach(ceiling => {
            const result = calculate({
                ...values,
                margin,
                ceiling,
                utilization: 90
            });
            const td = document.createElement("td");
            td.textContent = formatCurrency(result.profit);
            td.className = result.profit < 0
                ? "negative-cell"
                : result.actualMargin < 10
                    ? "caution-cell"
                    : "healthy-cell";
            tr.appendChild(td);
        });

        body.appendChild(tr);
    });
}

function updateRecommendation(values, highResult) {
    const box = byId("recommendationBox");
    const status = byId("recommendationStatus");
    const text = byId("recommendationText");

    box.classList.remove("caution", "high-risk");
    status.className = "status-pill";

    if (highResult.profit < 0) {
        box.classList.add("high-risk");
        status.classList.add("high");
        status.textContent = "High Risk";
        text.textContent = "At high utilization, the current ceiling/margin combination becomes loss-making. Increase Ceiling %, increase Margin %, or limit unbilled usage.";
    } else if (values.margin < 10) {
        box.classList.add("caution");
        status.classList.add("caution");
        status.textContent = "Caution";
        text.textContent = "Profit remains positive, but margin is thin. Review pricing before committing.";
    } else {
        status.classList.add("acceptable");
        status.textContent = "Acceptable";
        text.textContent = "Current structure remains profitable under the tested scenario.";
    }

    byId("recFloor").textContent = formatPercent(values.floor);
    byId("recCeiling").textContent = formatPercent(Math.max(values.ceiling, values.floor));
    byId("recMargin").textContent = formatPercent(values.margin);
    byId("recHighProfit").textContent = `${formatCurrency(highResult.profit)} SAR`;
}

function updateScenarioButtons() {
    document.querySelectorAll(".scenario-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.scenario === activeScenario);
    });
}

function updateTimestamp() {
    byId("timestamp").textContent = new Date().toLocaleString("en-SA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function updateAllDisplays(sourceId) {
    const values = sanitizeInputs(sourceId);
    const result = calculate(values);
    const highResult = highUtilizationResult(values);

    updateKpis(result, highResult);
    updateCapacityBand(result);
    updateScenarioTable(values);
    updateSensitivityTable(values);
    updateRecommendation(values, highResult);
    updateScenarioButtons();
    updateTimestamp();
}

function markCustomAndUpdate(sourceId) {
    activeScenario = "custom";
    updateAllDisplays(sourceId);
}

function bindSliderPair(sliderId, numberId) {
    const slider = byId(sliderId);
    const number = byId(numberId);

    slider.addEventListener("input", () => {
        number.value = slider.value;
        markCustomAndUpdate(sliderId);
    });

    number.addEventListener("input", () => {
        slider.value = number.value;
        markCustomAndUpdate(numberId);
    });

    number.addEventListener("change", () => {
        slider.value = number.value;
        markCustomAndUpdate(numberId);
    });
}

function bindNumberInput(inputId) {
    const input = byId(inputId);
    input.addEventListener("input", () => markCustomAndUpdate(inputId));
    input.addEventListener("change", () => markCustomAndUpdate(inputId));
}

function applyScenario(key) {
    const current = sanitizeInputs();
    const next = scenarioValues(current, key);
    activeScenario = key;
    syncAllInputs(next);
    updateAllDisplays();
}

function resetDefaults() {
    activeScenario = "custom";
    syncAllInputs(DEFAULTS);
    updateAllDisplays();
}

window.resetDefaults = resetDefaults;

document.addEventListener("DOMContentLoaded", () => {
    bindSliderPair("floor", "floorVal");
    bindSliderPair("ceiling", "ceilingVal");
    bindSliderPair("utilization", "utilizationVal");
    bindSliderPair("margin", "marginVal");
    bindNumberInput("capacity");
    bindNumberInput("cost");

    document.querySelectorAll(".scenario-btn").forEach(button => {
        button.addEventListener("click", () => applyScenario(button.dataset.scenario));
    });

    updateAllDisplays();
});
