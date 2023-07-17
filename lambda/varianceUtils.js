const { logger } = require("./logger");

function calculateVariance(
  historicalValues,
  currentValue,
  variancePercentage
) {
  const filteredInputs = historicalValues.filter((val) => val !== null && !isNaN(val));

  logger.info("=== Calculating variance ===");
  // We might receive two past years instead of three
  const numberOfYearsProvided = filteredInputs.length;
  logger.debug("Number of years provided:", numberOfYearsProvided);

  // Get the average value across provided years
  const averageHistoricValue = filteredInputs.reduce((acc, val) => acc + val, 0) / filteredInputs.length;
  logger.debug("Average historic value:", averageHistoricValue);

  // Calculate the percentage change only if averageHistoricValue is not zero
  let percentageChange;
  if (averageHistoricValue !== 0) {
    percentageChange = Math.round(((currentValue - averageHistoricValue) / averageHistoricValue) * 100) / 100;
  } else {
    // Set percentageChange to 0 or some other default value if averageHistoricValue is zero
    percentageChange = 0;
  }

  const percentageChangeAbs = Math.abs(percentageChange);

  const varianceMessage = `Variance triggered: ${percentageChangeAbs >= variancePercentage ? "+" : "-"}${Math.round(percentageChangeAbs * 100)}%`;

  // Since percentage change is absolute, we can subtract from variance percentage
  // If negative, variance is triggered
  const varianceTriggered = variancePercentage - percentageChangeAbs < 0 ? true : false;
  logger.info("Variance Triggered:", varianceTriggered);
  logger.info("Variance percentageChange:", percentageChange);
  logger.info("Variance variancePercentage:", variancePercentage);

  const res = {
    varianceMessage: varianceMessage,
    varianceTriggered: varianceTriggered,
    percentageChange: +percentageChange,
  };
  logger.info("Variance return obj:", res);
  logger.info("=== Variance calulation complete ===");
  return res;
}

module.exports = {
  calculateVariance,
};
