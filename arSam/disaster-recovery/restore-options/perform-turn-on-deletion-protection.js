const { opTurnOnDeletionProtection } = require('../operations/op-turn-on-deletion-protection');

const operations = require('../operations');
const { turnOnDelPro } = operations;

/**
 * Initiates the process for enabling Deletion Protection on a table.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for turnOnDelProOp
 *
 */
async function performTurnOnDeletionProtection(ops, chosenTable) {
  // Operation required for this process
  ops.turnOnDelPro = turnOnDelPro;

  try {
    // Now that the table is selected, set the resource name and console message
    ops.turnOnDelPro.targetTable = chosenTable;
    ops.turnOnDelPro.message = `\n🕑 TURNING ON Deletion Protection for [${ops.turnOnDelPro.targetTable}]...`;

    ops.turnOnDelPro = await opTurnOnDeletionProtection(ops.turnOnDelPro);
  } catch (error) {
    ops.turnOnDelPro.opStatus = 'failed';
    ops.turnOnDelPro.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performTurnOnDeletionProtection };
