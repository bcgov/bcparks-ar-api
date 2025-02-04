const { checkAndUpdate, duplicateTablePitr } = require('../functions');

/**
 * Executes the operation for duplicating and verifies the duplication exists.
 *
 * @param   {Object} duplicateOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated duplicateOp following execution and verification
 *
 */
async function opDuplicateTable(duplicateOp) {
  try {
    process.stdout.write(duplicateOp.message);
    duplicateOp.response = await duplicateTablePitr(
      duplicateOp.sourceTable,
      duplicateOp.targetTable,
      duplicateOp.dateTimeInputISO
    );

    // Verify that the duplication exists, check should return true
    duplicateOp.args = [duplicateOp.targetTable, true];

    await checkAndUpdate(duplicateOp);
  } catch (error) {
    duplicateOp.opStatus = 'failed';
    duplicateOp.errorMessage = error;
    throw error;
  }

  return duplicateOp;
}

module.exports = { opDuplicateTable };
