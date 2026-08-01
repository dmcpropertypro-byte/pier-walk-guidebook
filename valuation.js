(function () {
  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function initializeCalculator(root) {
    var monthlyInput = root.querySelector("#monthly-ebitda");
    var multipleInput = root.querySelector("#ebitda-multiple");
    var monthlyOutput = root.querySelector("#monthly-ebitda-output");
    var multipleOutput = root.querySelector("#ebitda-multiple-output");
    var annualOutput = root.querySelector("#annual-ebitda-output");
    var multipleSummary = root.querySelector("#multiple-summary-output");
    var enterpriseValueOutput = root.querySelector("#enterprise-value-output");

    function update() {
      var monthly = Number(monthlyInput.value);
      var multiple = Number(multipleInput.value);
      var annual = monthly * 12;
      var enterpriseValue = annual * multiple;

      monthlyOutput.textContent = money(monthly) + "/mo";
      multipleOutput.textContent = multiple.toFixed(1) + "×";
      annualOutput.textContent = money(annual);
      multipleSummary.textContent = multiple.toFixed(1) + "×";
      enterpriseValueOutput.textContent = money(enterpriseValue);
    }

    monthlyInput.addEventListener("input", update);
    multipleInput.addEventListener("input", update);
    update();
  }

  document.querySelectorAll("[data-ebitda-calculator]").forEach(initializeCalculator);
})();
