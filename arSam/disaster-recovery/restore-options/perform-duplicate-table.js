const { DateTime } = require('luxon');
const { opDuplicateTable } = require('../operations/op-duplicate-table');

const config = require('../config');
const { inputType, dynamoInputType } = config;

const operations = require('../operations');
const { duplicate } = operations;

/**
 * Part of the PITR steps to restore a table. Initiates the process for duplicating
 * a table in DynamoDB.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for duplicate
 *
 */
async function performDuplicateTable(ops, chosenTable, pitrTime) {
  // Operation required for this process
  ops.duplicate = duplicate;

  try {
    // ISO time that AWS uses when making PITR backup request
    let dateTimeInputISO = DateTime.fromFormat(pitrTime, inputType).toISO();

    // DynamoDB-friendly format for the backups
    let dupeTargetTable = `${chosenTable}--dupe-${DateTime.fromFormat(pitrTime, inputType).toFormat(dynamoInputType)}`;

    // Set the duplicate operation
    ops.duplicate.dateTimeInputISO = dateTimeInputISO;
    ops.duplicate.sourceTable = chosenTable;
    ops.duplicate.targetTable = dupeTargetTable;
    ops.duplicate.message = `\n📋 DUPLICATING [${ops.duplicate.sourceTable}] as [${ops.duplicate.targetTable}]...`;

    // Start the backup process
    ops.duplicate = await opDuplicateTable(ops.duplicate);
  } catch (error) {
    ops.duplicate.opStatus = 'failed';
    ops.duplicate.errorMessage = error;
  }

  return ops;
}

module.exports = { performDuplicateTable };
