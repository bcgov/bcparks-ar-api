const { opDynamoRestore } = require('../operations/op-dynamo-restore');

/**
 * Part of the PITR steps to restore a table. Initiates the process for
 * restoring a table from the duplicate table in DynamoDB Backups.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for restoreDynamo
 *
 */
async function performRestoreDynamo(ops, chosenTable) {
  // No operations imported for this process as ops.backupDynamoDupe
  // comes from the PITR steps.
  try {
    // Set the restoreDynamo operation coming from PITR steps
    ops.restoreDynamo.backupName = ops.duplicate.targetTable;
    ops.restoreDynamo.targetTable = chosenTable;
    ops.restoreDynamo.message = `\n🔄 RESTORING [${chosenTable}] from [${ops.duplicate.targetTable}] backup...`;

    // Start the restore process
    ops.restoreDynamo = await opDynamoRestore(ops.restoreDynamo);
  } catch (error) {
    ops.restoreDynamo.opStatus = 'failed';
    ops.restoreDynamo.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performRestoreDynamo };
