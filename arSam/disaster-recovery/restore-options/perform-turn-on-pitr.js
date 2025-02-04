const { opTurnOnPitr } = require('../operations/op-turn-on-pitr');

const operations = require('../operations');
const { turnOnPitr } = operations;

/**
 * Initiates the process for enabling PITR.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for turnOnPitr
 *
 */
async function performTurnOnPitr(ops, chosenTable) {
  // Operation required for this process
  ops.turnOnPitr = turnOnPitr;

  try {
    // Set the restoreDynamo operation
    ops.turnOnPitr.targetTable = chosenTable;
    ops.turnOnPitr.message = `\n🕑 TURNING ON PITR for [${chosenTable}]...`;

    // Start the process to enable PITR
    ops.turnOnPitr = await opTurnOnPitr(ops.turnOnPitr);
  } catch (error) {
    ops.turnOnPitr.opStatus = 'failed';
    ops.turnOnPitr.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performTurnOnPitr };
