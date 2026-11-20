
/* V6 - First Nations Visualisation */

// Load the KNIME-exported remoteness data.
d3.csv("data/exports/fn_remoteness_annual.csv", d3.autoType)
  .then(function (data) {

    // Confirm the total number of records.
    console.log("Total rows:", data.length);

    // Select only the records for 2021.
    const data2021 = data.filter(d => d.year === 2021);

    // Display the six 2021 records in the console.
    console.table(data2021);


    // Calculate total hospitalisations for each population group.
    const groupTotals = d3.rollup(
      data2021,
      rows => d3.sum(rows, d => d.hospitalisations),
      d => d.population_group
    );

    // Calculate each category's percentage within its group.
    const percentageData = data2021.map(d => ({
      ...d,
      percentage:
        (d.hospitalisations / groupTotals.get(d.population_group)) * 100
    }));

    // Display the calculated percentages.
    console.table(percentageData);

    // Temporary message before we build the chart.
    
    // STEP 5: Draw paired horizontal bar chart

    const categories = ["Major Cities", "Regional", "Remote"];

    const groups = [
      "First Nations people",
      "Non-Indigenous"
    ];

    const colors = {
      "First Nations people": "#4289AC",
      "Non-Indigenous": "#D99A56"
    };

    // SVG dimensions
    const width = 900;
    const height = 390;

    const margin = {
      top: 75,
      right: 90,
      bottom: 35,
      left: 145
    };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select("#bar-chart")
      .html("")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label",
        "Paired bar chart comparing hospitalisation shares by remoteness in 2021")
      .style("width", "100%")
      .style("min-width", "700px")
      .style("height", "auto");

    const chart = svg.append("g")
      .attr("transform",
        `translate(${margin.left},${margin.top})`);

    // Horizontal scale: 0% to 100%
    const x = d3.scaleLinear()
      .domain([0, 100])
      .range([0, chartWidth]);

    // Main categories
    const y = d3.scaleBand()
      .domain(categories)
      .range([0, chartHeight])
      .padding(0.3);

    // Two bars within each category
    const yGroup = d3.scaleBand()
      .domain(groups)
      .range([0, y.bandwidth()])
      .padding(0.12);

    // Percentage axis
    chart.append("g")
      .call(
        d3.axisTop(x)
          .tickValues([0, 25, 50, 75, 100])
          .tickFormat(d => d + "%")
      );

    // Remoteness labels
    chart.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.select(".domain").remove())
      .selectAll("text")
      .style("font-size", "14px")
      .attr("dx", "-8");

    // Draw six bars
    chart.selectAll(".v6-bar")
      .data(percentageData)
      .join("rect")
      .attr("class", "v6-bar")
      .attr("x", 0)
      .attr("y", d =>
        y(d.remoteness) + yGroup(d.population_group)
      )
      .attr("width", d => x(d.percentage))
      .attr("height", yGroup.bandwidth())
      .attr("fill", d => colors[d.population_group]);

    // Percentage labels at the ends of bars
    chart.selectAll(".v6-value")
      .data(percentageData)
      .join("text")
      .attr("class", "v6-value")
      .attr("x", d => x(d.percentage) + 8)
      .attr("y", d =>
        y(d.remoteness)
        + yGroup(d.population_group)
        + yGroup.bandwidth() / 2
      )
      .attr("dominant-baseline", "middle")
      .style("font-size", "13px")
      .text(d => d.percentage.toFixed(2) + "%");

    // Legend
    const legend = svg.append("g")
      .attr("transform", "translate(145,20)");

    groups.forEach((group, i) => {
      const item = legend.append("g")
        .attr("transform", `translate(${i * 250},0)`);

      item.append("rect")
        .attr("width", 14)
        .attr("height", 14)
        .attr("fill", colors[group]);

      item.append("text")
        .attr("x", 22)
        .attr("y", 12)
        .style("font-size", "13px")
        .text(group);
    });

    
    // STEP 6: Interactive year selector

    // Get available years from the CSV.
    const years = [...new Set(data.map(d => d.year))]
      .sort((a, b) => a - b);

    const yearSelect = d3.select("#year-select");

    // Populate the dropdown with all available years.
    yearSelect.selectAll("option")
      .data(years)
      .join("option")
      .attr("value", d => d)
      .text(d => d);

    // Default to the most recent year.
    yearSelect.property("value", 2021);

    const yearStatus = d3.select("#bar-chart")
      .insert("p", "svg")
      .attr("id", "v6-year-status")
      .attr("role", "status");

    // Update the chart when the user changes the year.
    yearSelect.on("change", function () {

      const selectedYear = Number(this.value);

      const selectedData = data.filter(
        d => d.year === selectedYear
      );

      // Do not treat missing or suppressed values as zero.
      const isComplete = selectedData.length === 6 &&
        selectedData.every(d =>
          d.annual_status === "complete" &&
          Number.isFinite(d.hospitalisations) &&
          d.hospitalisations >= 0
        );

      if (!isComplete) {
        yearStatus.text(
          "Data is incomplete or not reported for this year."
        );
        chart.selectAll(".v6-bar").attr("width", 0);
        chart.selectAll(".v6-value").text("");
        return;
      }

      // Recalculate group totals for the selected year.
      const newTotals = d3.rollup(
        selectedData,
        rows => d3.sum(rows, d => d.hospitalisations),
        d => d.population_group
      );

      // Calculate updated percentages.
      const updatedData = selectedData.map(d => ({
        ...d,
        percentage:
          newTotals.get(d.population_group) > 0
            ? d.hospitalisations /
              newTotals.get(d.population_group) * 100
            : NaN
      }));

      if (updatedData.some(d => !Number.isFinite(d.percentage))) {
        yearStatus.text("Percentage unavailable for this year.");
        chart.selectAll(".v6-bar").attr("width", 0);
        chart.selectAll(".v6-value").text("");
        return;
      }

      yearStatus.text(`Showing hospitalisations for ${selectedYear}`);
      svg.attr(
        "aria-label",
        `Hospitalisation distribution by remoteness in ${selectedYear}`
      );

      const rowKey = d =>
        `${d.remoteness}|${d.population_group}`;

      // Animate bar widths and positions.
      
chart.selectAll(".v6-bar")
  .data(updatedData, rowKey)
  .attr("aria-label", d =>
    `${d.population_group}, ${d.remoteness}, ` +
    `${d.year}: ${d.hospitalisations} hospitalisations, ` +
    `${d.percentage.toFixed(2)} percent`
  )
  .transition()

        .duration(500)
        .attr("y", d =>
          y(d.remoteness) + yGroup(d.population_group)
        )
        .attr("width", d => x(d.percentage));

      // Update percentage labels.
      chart.selectAll(".v6-value")
        .data(updatedData, rowKey)
        .transition()
        .duration(500)
        .attr("x", d => x(d.percentage) + 8)
        .attr("y", d =>
          y(d.remoteness) +
          yGroup(d.population_group) +
          yGroup.bandwidth() / 2
        )
        .text(d => d.percentage.toFixed(2) + "%");
    });

    // STEP 7: Interactive tooltips

    const tooltip = d3.select("#bar-chart")
      .append("div")
      .attr("class", "v6-tooltip")
      .attr("role", "tooltip")
      .style("display", "none");

    // Display the selected bar's information.
    function showTooltip(event, d) {

      const details =
        `${d.population_group}\n` +
        `${d.remoteness} (${d.year})\n` +
        `Hospitalisations: ${d.hospitalisations.toLocaleString("en-AU")}\n` +
        `Share within group: ${d.percentage.toFixed(2)}%`;

      tooltip
        .text(details)
        .style("display", "block");

      // Position the tooltip near the selected bar.
      const rect = event.currentTarget.getBoundingClientRect();

      const left = Math.max(
        8,
        Math.min(rect.right + 12, window.innerWidth - 250)
      );

      const top = Math.max(
        8,
        Math.min(rect.top, window.innerHeight - 140)
      );

      tooltip
        .style("left", `${left}px`)
        .style("top", `${top}px`);
    }

    function hideTooltip() {
      tooltip.style("display", "none");
    }

    // Apply interactions to the existing six bars.
    chart.selectAll(".v6-bar")
      .attr("tabindex", 0)
      .attr("aria-label", d =>
        `${d.population_group}, ${d.remoteness}, ` +
        `${d.year}: ${d.hospitalisations} hospitalisations, ` +
        `${d.percentage.toFixed(2)} percent`
      )
      .on("mouseenter.v6 focus.v6", showTooltip)
      .on("mouseleave.v6 blur.v6", hideTooltip);

      // STEP 11: Show Data table for the paired bar chart

    const dataButton = d3.select("#v6-show-bar-data");
    const tableContainer = d3.select("#v6-bar-data-table");

    function renderBarDataTable(selectedYear) {
      const rows = data
        .filter(d => d.year === selectedYear)
        .sort((a, b) =>
          categories.indexOf(a.remoteness) -
          categories.indexOf(b.remoteness) ||
          groups.indexOf(a.population_group) -
          groups.indexOf(b.population_group)
        );

      // Calculate totals only for fully reported groups.
      const totals = new Map();

      groups.forEach(group => {
        const groupRows = rows.filter(
          d => d.population_group === group
        );

        const complete = groupRows.length === 3 &&
          new Set(groupRows.map(d => d.remoteness)).size === 3 &&
          groupRows.every(d =>
            d.annual_status === "complete" &&
            Number.isFinite(d.hospitalisations) &&
            d.hospitalisations >= 0
          );

        if (complete) {
          totals.set(
            group,
            d3.sum(groupRows, d => d.hospitalisations)
          );
        }
      });

      tableContainer.html("");

      const table = tableContainer
        .append("table")
        .attr("class", "v6-data-table");

      table.append("caption")
        .text(`Remoteness distribution, ${selectedYear}`);

      const headings = [
        "Remoteness",
        "Population group",
        "Hospitalisations",
        "Share"
      ];

      table.append("thead")
        .append("tr")
        .selectAll("th")
        .data(headings)
        .join("th")
        .attr("scope", "col")
        .text(d => d);

      const tbody = table.append("tbody");

      tbody.selectAll("tr")
        .data(rows)
        .join("tr")
        .each(function(d) {
          const total = totals.get(d.population_group);

          const reported = d.annual_status === "complete" &&
            Number.isFinite(d.hospitalisations);

          const count = reported
            ? d.hospitalisations.toLocaleString("en-AU")
            : "Not reported";

          const share = total > 0 && reported
            ? (d.hospitalisations / total * 100).toFixed(2) + "%"
            : "Not reported";

          d3.select(this)
            .selectAll("td")
            .data([
              d.remoteness,
              d.population_group,
              count,
              share
            ])
            .join("td")
            .text(value => value);
        });
    }

    // Toggle the table's visibility.
    dataButton.on("click", function() {
      const isOpening = tableContainer.property("hidden");

      tableContainer.property("hidden", !isOpening);
      dataButton
        .text(isOpening ? "Hide Data" : "Show Data")
        .attr("aria-expanded", String(isOpening));

      if (isOpening) {
        renderBarDataTable(
          Number(d3.select("#year-select").property("value"))
        );
      }
    });

    // Keep the table synchronised with the year selector.
    d3.select("#year-select")
      .on("change.v6table", function() {
        if (!tableContainer.property("hidden")) {
          renderBarDataTable(Number(this.value));
        }
      });

  })
  .catch(function (error) {
    console.error("Failed to load V6 data:", error);

    d3.select("#bar-chart")
      .text("Unable to load data. Check the CSV file path.");
  });



/* STEP 8: Load annual hospitalisation data */

d3.csv(
  "data/exports/fn_published_annual_totals.csv",
  d3.autoType
)
.then(function (annualData) {

  // Keep only the two population groups.
  const lineData = annualData.filter(d =>
    d.population_group === "First Nations peoples" ||
    d.population_group === "Non-Indigenous Australians"
  );

  console.log("Line chart records:", lineData.length);
  console.table(lineData.filter(d => d.year === 2021));

  // Temporary message to confirm loading.
  
  // STEP 9: Draw the annual hospitalisation line chart

  const lineGroups = [
    "First Nations peoples",
    "Non-Indigenous Australians"
  ];

  const lineColors = {
    "First Nations peoples": "#4289AC",
    "Non-Indigenous Australians": "#D99A56"
  };

  // SVG dimensions
  const width = 900;
  const height = 440;

  const margin = {
    top: 75,
    right: 40,
    bottom: 65,
    left: 85
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Create SVG
  const svg = d3.select("#line-chart")
    .html("")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label",
      "Line chart comparing annual hospitalisation counts " +
      "for First Nations peoples and non-Indigenous Australians"
    )
    .style("width", "100%")
    .style("min-width", "650px")
    .style("height", "auto");

  const chart = svg.append("g")
    .attr("transform",
      `translate(${margin.left},${margin.top})`);

  // Horizontal axis: Year
  const x = d3.scaleLinear()
    .domain([2011, 2021])
    .range([0, chartWidth]);

  // Vertical axis: Number of hospitalisations
  const y = d3.scaleLinear()
    .domain([
      0,
      d3.max(lineData, d => d.hospitalisations)
    ])
    .nice()
    .range([chartHeight, 0]);

  // Draw X-axis
  chart.append("g")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(
      d3.axisBottom(x)
        .tickValues(d3.range(2011, 2022))
        .tickFormat(d3.format("d"))
    );

  // Draw Y-axis
  chart.append("g")
    .call(
      d3.axisLeft(y)
        .ticks(6)
        .tickFormat(d3.format(","))
    );

  // X-axis label
  chart.append("text")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight + 48)
    .attr("text-anchor", "middle")
    .text("Year");

  // Y-axis label
  chart.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", -65)
    .attr("text-anchor", "middle")
    .text("Hospitalisations");

  // Line generator
  const line = d3.line()
    .defined(d =>
      Number.isFinite(d.year) &&
      Number.isFinite(d.hospitalisations)
    )
    .x(d => x(d.year))
    .y(d => y(d.hospitalisations));

  // Draw a line for each population group
  lineGroups.forEach(group => {

    const groupData = lineData
      .filter(d => d.population_group === group)
      .sort((a, b) => a.year - b.year);

    // Draw the line
    chart.append("path")
      .datum(groupData)
      .attr("fill", "none")
      .attr("stroke", lineColors[group])
      .attr("stroke-width", 3)
      .attr("d", line);

    // Draw points for each year
    chart.selectAll(null)
      .data(groupData)
      .enter()
      .append("circle")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.hospitalisations))
      .attr("r", 5)
      .attr("fill", lineColors[group])
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .attr("tabindex", 0)
      .attr("aria-label", d =>
        `${group}, ${d.year}: ` +
        `${d.hospitalisations.toLocaleString("en-AU")} hospitalisations`
      )
      .append("title")
      .text(d =>
        `${group}\n` +
        `Year: ${d.year}\n` +
        `Hospitalisations: ${d.hospitalisations.toLocaleString("en-AU")}`
      );
  });

  // Legend
  const legend = svg.append("g")
    .attr("transform", "translate(85,25)");

  lineGroups.forEach((group, i) => {
    const item = legend.append("g")
      .attr("transform", `translate(${i * 270},0)`);

    item.append("line")
      .attr("x1", 0)
      .attr("x2", 22)
      .attr("y1", 7)
      .attr("y2", 7)
      .attr("stroke", lineColors[group])
      .attr("stroke-width", 3);

    item.append("text")
      .attr("x", 30)
      .attr("y", 12)
      .style("font-size", "13px")
      .text(group);
  });


  // STEP 10: Synchronise the line chart with the year selector

  // Vertical guide showing the selected year.
  const selectedYearGuide = chart.append("line")
    .attr("y1", 0)
    .attr("y2", chartHeight)
    .attr("stroke", "#64748b")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "5,5")
    .style("pointer-events", "none");

  // Keep the guide behind the data points.
  selectedYearGuide.lower();

  // Highlighted points for the selected year.
  const selectedYearMarkers = chart.append("g")
    .attr("class", "v6-selected-year-markers")
    .style("pointer-events", "none");

  // Text showing the year being highlighted.
  const selectedYearStatus = d3.select("#line-chart")
    .insert("p", "svg")
    .attr("class", "v6-selected-year-status")
    .attr("role", "status");

  function updateLineHighlight(selectedYear) {

    // Position the dashed guide.
    selectedYearGuide
      .attr("x1", x(selectedYear))
      .attr("x2", x(selectedYear));

    // Find the two records for the selected year.
    const selectedPoints = lineData.filter(d =>
      d.year === selectedYear &&
      Number.isFinite(d.hospitalisations)
    );

    // Draw larger markers over the selected year's points.
    selectedYearMarkers.selectAll("circle")
      .data(selectedPoints, d => d.population_group)
      .join("circle")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.hospitalisations))
      .attr("r", 8)
      .attr("fill", d => lineColors[d.population_group])
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    selectedYearStatus.text(
      `Highlighted year: ${selectedYear}`
    );
  }

  // Listen to the existing dropdown without replacing
  // the bar chart's change handler.
  d3.select("#year-select")
    .on("change.v6line", function () {
      updateLineHighlight(Number(this.value));
    });

  // Initialise using the currently selected year.
  const initialYear = Number(
    d3.select("#year-select").property("value")
  ) || 2021;

  updateLineHighlight(initialYear);


})
.catch(function (error) {
  console.error("Line chart data error:", error);

  d3.select("#line-chart")
    .text("Unable to load annual data.");
});

