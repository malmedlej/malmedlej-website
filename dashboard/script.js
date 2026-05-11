const DEFAULTS = {
    capacity: 80000,
    cost: 39.5,
    margin: 15,
    floor: 40,
    ceiling: 85,
    expectedUtilization: 60,
    stressUtilization: 90
};

const OPTION_KEYS = ["lower", "balanced", "higherCeiling", "fullBilling"];

const COMMERCIAL_OPTIONS = {
    current: {
        name: "Current Structure",
        comment: "Uses the selected commercial levers."
    },
    lower: {
        name: "Lower Commitment",
        floor: 30,
        comment: "Reduces minimum commitment while keeping current cap and margin."
    },
    balanced: {
        name: "Balanced Offer",
        floor: 40,
        ceiling: 85,
        margin: 20,
        comment: "Improves margin while keeping a familiar floor and ceiling."
    },
    higherCeiling: {
        name: "Higher Ceiling",
        floor: 40,
        ceiling: 90,
        margin: 20,
        comment: "Captures more high-use volume with stronger pricing."
    },
    fullBilling: {
        name: "Full Billing",
        floor: 40,
        ceiling: 100,
        margin: 15,
        comment: "Removes above-ceiling leakage while keeping a moderate margin."
    }
};

let activeOption = "";

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
        expectedUtilization: numberValue("expectedUtilization", DEFAULTS.expectedUtilization),
        stressUtilization: numberValue("stressUtilization", DEFAULTS.stressUtilization),
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
    syncPair("expectedUtilization", "expectedUtilizationVal", values.expectedUtilization);
    syncPair("stressUtilization", "stressUtilizationVal", values.stressUtilization);
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
        expectedUtilization: clamp(raw.expectedUtilization, 0, 100),
        stressUtilization: clamp(raw.stressUtilization, 0, 100),
        margin: Math.max(0, raw.margin),
        capacity: Math.max(1, raw.capacity),
        cost: Math.max(0.01, raw.cost)
    };

    if (clean.expectedUtilization !== raw.expectedUtilization) warnings.push("Expected Utilization must be between 0% and 100%.");
    if (clean.stressUtilization !== raw.stressUtilization) warnings.push("Stress Utilization must be between 0% and 100%.");
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

function sellingPrice(values) {
    return values.cost * (1 + values.margin / 100);
}

function calculateCase(values, utilization) {
    const clean = {
        floor: clamp(values.floor, 0, 100),
        ceiling: clamp(values.ceiling, 0, 100),
        utilization: clamp(utilization, 0, 100),
        margin: Math.max(0, values.margin),
        capacity: Math.max(1, values.capacity),
        cost: Math.max(0.01, values.cost)
    };

    const floorPallets = Math.round(clean.capacity * clean.floor / 100);
    const ceilingPallets = Math.round(clean.capacity * clean.ceiling / 100);
    const usedPallets = Math.round(clean.capacity * clean.utilization / 100);
    const chargedPallets = Math.min(Math.max(usedPallets, floorPallets), ceilingPallets);
    const price = sellingPrice(clean);
    const revenue = chargedPallets * price;
    const totalCost = usedPallets * clean.cost;
    const profit = revenue - totalCost;
    const marginPercent = revenue > 0 ? profit / revenue * 100 : 0;
    const unbilledAboveCeiling = Math.max(usedPallets - ceilingPallets, 0);
    const revenueLeakage = unbilledAboveCeiling * price;

    return {
        ...clean,
        floorPallets,
        ceilingPallets,
        usedPallets,
        chargedPallets,
        sellingPrice: price,
        revenue,
        totalCost,
        profit,
        marginPercent,
        unbilledAboveCeiling,
        revenueLeakage
    };
}

function evaluateStructure(values) {
    return {
        expected: calculateCase(values, values.expectedUtilization),
        stress: calculateCase(values, values.stressUtilization)
    };
}

function decisionStatus(stressResult) {
    if (stressResult.profit < 0) return "Not Recommended";
    if (stressResult.profit > 0 && stressResult.marginPercent < 10) return "Revise Pricing";
    return "Proceed";
}

function statusClass(status) {
    if (status === "Not Recommended") return "risk";
    if (status === "Revise Pricing") return "warning";
    return "positive";
}

function setCardClass(id, status) {
    const card = byId(id);
    card.classList.remove("positive", "warning", "negative", "risk", "neutral");
    card.classList.add(status);
}

function optionValues(base, key) {
    const option = COMMERCIAL_OPTIONS[key];
    return {
        ...base,
        floor: option.floor ?? base.floor,
        ceiling: option.ceiling ?? base.ceiling,
        margin: option.margin ?? base.margin
    };
}

function recommendationText(status) {
    if (status === "Not Recommended") {
        return "Not recommended. Stress case becomes loss-making; increase margin or raise the ceiling before offering.";
    }
    if (status === "Revise Pricing") {
        return "Revise pricing. Stress case remains positive, but margin is below target.";
    }
    return "Proceed with the selected structure. Expected and stress cases remain profitable.";
}

function adjustmentText(status) {
    if (status === "Not Recommended") return "Suggested adjustment: increase margin or raise the ceiling.";
    if (status === "Revise Pricing") return "Suggested adjustment: increase margin.";
    return "No adjustment required.";
}

function updateKpis(values, expected, stress, status) {
    byId("sellingPrice").textContent = formatPrice(expected.sellingPrice);
    byId("revenue").textContent = formatCurrency(expected.revenue);
    byId("costDisplay").textContent = formatCurrency(expected.totalCost);
    byId("profit").textContent = formatCurrency(expected.profit);
    byId("actualMargin").textContent = formatPercent(expected.marginPercent);
    byId("chargedPallets").textContent = formatNumber(expected.chargedPallets);
    byId("chargedSubtext").textContent = `floor ${formatNumber(expected.floorPallets)} | ceiling ${formatNumber(expected.ceilingPallets)}`;
    byId("actualUsedPallets").textContent = formatNumber(expected.usedPallets);
    byId("revenueLeakage").textContent = formatCurrency(stress.revenueLeakage);
    byId("stressProfit").textContent = `${formatCurrency(stress.profit)} SAR`;
    byId("riskSubtext").textContent = `At ${formatPercent(values.stressUtilization)} utilization`;
    byId("stressUnbilled").textContent = `Unbilled above ceiling: ${formatNumber(stress.unbilledAboveCeiling)} pallets`;
    byId("stressDecision").textContent = `Decision: ${status}`;

    setCardClass("profitCard", expected.profit < 0 ? "negative" : "positive");
    setCardClass("marginCard", expected.marginPercent < 0 ? "negative" : expected.marginPercent < 10 ? "warning" : "positive");
    setCardClass("leakageCard", stress.revenueLeakage > 0 ? "warning" : "neutral");
    setCardClass("riskCard", statusClass(status));
}

function updateCapacityBand(values, expected, stress) {
    const floorPct = clamp(values.floor, 0, 100);
    const expectedPct = clamp(values.expectedUtilization, 0, 100);
    const stressPct = clamp(values.stressUtilization, 0, 100);
    const ceilingPct = clamp(values.ceiling, 0, 100);
    const visibleExpected = Math.min(expectedPct, ceilingPct);
    const overage = Math.max(stressPct - ceilingPct, 0);

    byId("bandCommitted").style.width = `${floorPct}%`;
    byId("bandUsed").style.left = "0%";
    byId("bandUsed").style.width = `${visibleExpected}%`;
    byId("bandUsed").classList.toggle("within", expectedPct >= floorPct && expectedPct <= ceilingPct);
    byId("bandOverage").style.left = `${ceilingPct}%`;
    byId("bandOverage").style.width = `${overage}%`;
    byId("floorMarker").style.left = `${floorPct}%`;
    byId("expectedMarker").style.left = `${expectedPct}%`;
    byId("stressMarker").style.left = `${stressPct}%`;
    byId("ceilingMarker").style.left = `${ceilingPct}%`;
    byId("floorBandLabel").textContent = `Floor: ${formatPercent(floorPct)}`;
    byId("expectedBandLabel").textContent = `Expected: ${formatPercent(expectedPct)}`;
    byId("stressBandLabel").textContent = `Stress: ${formatPercent(stressPct)}`;
    byId("ceilingBandLabel").textContent = `Ceiling: ${formatPercent(ceilingPct)}`;

    const status = byId("bandStatus");
    status.className = "status-pill";
    if (stress.unbilledAboveCeiling > 0) {
        status.textContent = "Stress Above Ceiling";
        status.classList.add("warning");
    } else if (expected.usedPallets < expected.floorPallets) {
        status.textContent = "Expected Below Floor";
        status.classList.add("warning");
    } else {
        status.textContent = "Within Structure";
        status.classList.add("positive");
    }
}

function updateAssessment(values, expected, stress, status) {
    const box = byId("recommendationBox");
    const pill = byId("recommendationStatus");

    box.classList.remove("caution", "high-risk", "positive");
    pill.className = `status-pill ${statusClass(status)}`;
    pill.textContent = status;
    box.classList.add(statusClass(status) === "risk" ? "high-risk" : statusClass(status) === "warning" ? "caution" : "positive");

    byId("recommendationText").textContent = recommendationText(status);
    byId("assessmentExpectedProfit").textContent = `${formatCurrency(expected.profit)} SAR`;
    byId("assessmentStressProfit").textContent = `${formatCurrency(stress.profit)} SAR`;
    byId("assessmentStressLeakage").textContent = `${formatCurrency(stress.revenueLeakage)} SAR`;
}

function optionComment(status, option) {
    if (status === "Not Recommended") return "Stress case is loss-making; revise before offering.";
    if (status === "Revise Pricing") return "Positive stress profit, but margin is below target.";
    return option.comment;
}

function renderCommercialOptions(values) {
    const container = byId("optionCards");
    container.innerHTML = "";

    OPTION_KEYS.forEach(key => {
        const option = COMMERCIAL_OPTIONS[key];
        const candidate = optionValues(values, key);
        const { expected, stress } = evaluateStructure(candidate);
        const status = decisionStatus(stress);
        const card = document.createElement("article");
        card.className = `option-card ${statusClass(status)} ${key === activeOption ? "active" : ""}`;
        card.innerHTML = `
            <div class="option-card-header">
                <h3>${option.name}</h3>
                <span class="status-pill ${statusClass(status)}">${status}</span>
            </div>
            <dl>
                <div><dt>Floor</dt><dd>${formatPercent(candidate.floor)}</dd></div>
                <div><dt>Ceiling</dt><dd>${formatPercent(candidate.ceiling)}</dd></div>
                <div><dt>Margin</dt><dd>${formatPercent(candidate.margin)}</dd></div>
                <div><dt>Stress Profit</dt><dd>${formatCurrency(stress.profit)} SAR</dd></div>
                <div><dt>Unbilled Pallets</dt><dd>${formatNumber(stress.unbilledAboveCeiling)}</dd></div>
            </dl>
            <button class="option-select" type="button" data-option="${key}">Apply</button>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll(".option-select").forEach(button => {
        button.addEventListener("click", () => applyOption(button.dataset.option));
    });
}

function updateAllDisplays(sourceId) {
    const values = sanitizeInputs(sourceId);
    const { expected, stress } = evaluateStructure(values);
    const status = decisionStatus(stress);

    updateKpis(values, expected, stress, status);
    updateCapacityBand(values, expected, stress);
    updateAssessment(values, expected, stress, status);
    renderCommercialOptions(values);
}

function markCurrentAndUpdate(sourceId) {
    activeOption = "";
    updateAllDisplays(sourceId);
}

function bindSliderPair(sliderId, numberId) {
    const slider = byId(sliderId);
    const number = byId(numberId);

    slider.addEventListener("input", () => {
        number.value = slider.value;
        markCurrentAndUpdate(sliderId);
    });

    number.addEventListener("input", () => {
        slider.value = number.value;
        markCurrentAndUpdate(numberId);
    });

    number.addEventListener("change", () => {
        slider.value = number.value;
        markCurrentAndUpdate(numberId);
    });
}

function bindNumberInput(inputId) {
    const input = byId(inputId);
    input.addEventListener("input", () => markCurrentAndUpdate(inputId));
    input.addEventListener("change", () => markCurrentAndUpdate(inputId));
}

function applyOption(key) {
    const current = sanitizeInputs();
    const next = optionValues(current, key);
    activeOption = key;
    syncAllInputs(next);
    updateAllDisplays();
}

function resetDefaults() {
    activeOption = "";
    syncAllInputs(DEFAULTS);
    updateAllDisplays();
}

window.resetDefaults = resetDefaults;

document.addEventListener("DOMContentLoaded", () => {
    bindSliderPair("floor", "floorVal");
    bindSliderPair("ceiling", "ceilingVal");
    bindSliderPair("expectedUtilization", "expectedUtilizationVal");
    bindSliderPair("stressUtilization", "stressUtilizationVal");
    bindSliderPair("margin", "marginVal");
    bindNumberInput("capacity");
    bindNumberInput("cost");

    updateAllDisplays();
});
