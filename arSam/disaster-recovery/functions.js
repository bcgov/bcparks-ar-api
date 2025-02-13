const { exit } = require('process');
const readline = require('readline');
const { spawn } = require('child_process');

const config = require('./config');
const { timeout } = config;

let rlInterface;

/**
 * Creates a readline interface instance for handling command line input/output.
 *
 */
function activateReadline() {
  rlInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Clears the current input line and resets the prompt in the readline interface.
 *
 */
function clearInputAndResetPrompt() {
  if (rlInterface) {
    rlInterface.input.resume();
    rlInterface.clearLine(0);
    rlInterface.prompt();
  }
}

/**
 * Runs an AWS command from the user.
 *
 * @param   {Array} args - arguments for AWS command to execute
 *
 */
async function awsCommand(args) {
  const command = 'aws';

  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';

    const childProcess = spawn(command, args);

    childProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    childProcess.on('close', (code) => {
      if (code !== 0) {
        console.log('\n');
        reject(new Error(`\n📦 AWS CLI command failed with error: \n${stderrData}`));
      } else {
        try {
          const parsedOutput = JSON.parse(stdoutData);
          resolve(parsedOutput);
        } catch (error) {
          throw error;
        }
      }
    });
  });
}

/**
 * Sends the user back to the main menu (after a short delay).
 *
 */
async function backToMainMenu() {
  const { mainMenu } = require('./restore-dynamo');

  console.log(`\n🔙 Back to main menu...`);
  clearInputAndResetPrompt();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await mainMenu();
}

/**
 * Ask user if they would like to continue the script or exit.
 *
 */
async function backToMenuOrExit() {
  let confirmMainMenu = await getConsoleInput(
    `\n❔ Would you like to go back to the main menu? Otherwise the script will exit.`,
    ['y', 'n']
  );

  if (confirmMainMenu == 'y') {
    await backToMainMenu();
  } else {
    console.log(`\n👋 Exiting...`);
    exit();
  }
}

/**
 * Takes an operation type and uses its check function, args, and expectFromCheck to
 * update the console accordingly.
 *
 * @param   {Object} opsType - any operation type (eg. delete, restore, backup), which
 *                  contains the operation settings for that specified operation.
 * @returns {Object} returns the updated opsType object.
 *
 */
async function checkAndUpdate(opsType) {
  // Run the check function, which is something like checkTableExists(), etc.
  let check = await opsType.check(...opsType.args);

  if (check === opsType.expectFromCheck) {
    opsType.opStatus = 'success';
    updateConfirmMessage();
  } else {
    throw `Check function expected ${opsType.expectFromCheck} but returned ${check}. Were you expecting ${opsType.expectFromCheck}?`;
  }

  return opsType;
}

/**
 * Check if a backup exists in DynamoDB Backup.
 *
 * @param   {String}  sourceTable - the selected table to check
 * @param   {String}  backupName - name of backup to be created
 * @returns {Boolean} confirms the backup was created
 */
async function checkBackupExistsInDynamo(sourceTable, backupName) {
  let exists = false;
  let t = 0;
  const waitIndefinitely = timeout == -1;

  // Continue running until the backup exists
  // or timeout is reached (if set in config)
  while (!exists && (waitIndefinitely || t < timeout)) {
    outputTimeUpdate(t);
    t++;

    // Check every 5 seconds if table has been restored
    if (t % 5 == 0) {
      backupsObj = await awsCommand(['dynamodb', 'list-backups', '--table-name', sourceTable]);

      exists = backupsObj.BackupSummaries.some(
        (summary) =>
          summary.TableName == sourceTable && summary.BackupName == backupName && summary.BackupStatus == 'AVAILABLE'
      );
      t++;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Only get here after timeout, offer user to keep waiting
  if (!exists) {
    let continueChecking = await getConsoleInput(`Timed out during checking if backup exists - continue waiting?`, [
      'y',
      'n'
    ]);

    if (continueChecking == 'y') {
      exists = await checkBackupExistsInDynamo(sourceTable, backupName);
    } else {
      console.log(`\n❗ Try running again.`);
      console.log(`\n👋 Exiting...`);
      exit();
    }
  }

  return exists;
}

/**
 * Return true or false if there are any issues with the config.js file, as well
 * as any errors with the config.js
 *
 * @param   {Object} config - config items from config.js
 * @returns {Object} isValid boolean and an array of any errors
 *
 */
async function checkConfig(config) {
  const errors = [];

  function hourglass(num) {
    const emoji = ['⏳', '⌛'];
    process.stdout.cursorTo(0);
    process.stdout.write(`${emoji[num]} Checking the config.js for issues...`);
  }

  // Get account info, backup vaults, and backup role and its policies
  console.log('\n');
  hourglass(0);
  const accountObj = await awsCommand([`sts`, `get-caller-identity`]);
  const account = accountObj.Account;
  hourglass(1);
  const vaultsObj = await awsCommand([`backup`, `list-backup-vaults`]);
  const vaultExists = vaultsObj?.BackupVaultList?.some((vault) => vault.BackupVaultName === config.vaultName);
  hourglass(0);
  const roles = await awsCommand([`iam`, `list-roles`]);
  const roleExists = roles?.Roles?.some((role) => role.RoleName === config.backupRole);
  hourglass(1);
  let awsBackupRestorePolicy = false;
  if (roleExists) {
    const policies = await awsCommand([`iam`, 'list-attached-role-policies', `--role-name`, config.backupRole]);
    awsBackupRestorePolicy = policies?.AttachedPolicies?.some(
      (policy) => policy.PolicyName === 'AWSBackupServiceRolePolicyForRestores'
    );
  }
  hourglass(0);

  // Check environment matches AWS credentials
  if (config.environment != account) {
    errors.push(
      `Your configured environment [${config.environment}] does not match the AWS account environment [${account}] identified by your AWS credentials.`
    );
  }

  // Check vault name exists in AWS Backups
  if (!vaultExists) {
    errors.push(`The vault [${config.vaultName}] does not exist in AWS Backup.`);
  }

  // Check vault name exists in AWS Backups
  if (!roleExists) {
    errors.push(`The backup and restore role [${config.backupRole}] does not exist in AWS.`);
  }

  // Check if AWSBackupServiceRolePolicyForRestores policy exists on the backupRole
  if (!awsBackupRestorePolicy) {
    errors.push(
      `The role [${config.backupRole}] does not have the required policy [AWSBackupServiceRolePolicyForRestores] and can't restore from AWS Backup.`
    );
  }

  // Check that timeout is a number
  if (!Number.isInteger(config.timeout)) {
    errors.push('Timeout must be an integer');
  } else if (config.timeout !== -1 && config.timeout <= 0) {
    errors.push('Timeout must be -1 or a positive integer');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Check if a table exists in AWS. This uses `aws describe-table` to see what the
 * current status of a table is and attempts to confirm/match the shouldExist param.
 *
 * @param   {String}  chosenTable - the selected table to check
 * @param   {Boolean} shouldExist - whether the table should or shouldn't exist
 * @returns {Boolean} confirmation that the table exists or doesn't exist
 *
 */
async function checkTableExists(chosenTable, shouldExist) {
  // conditional should be inverse of shouldExist
  let exists = !shouldExist;
  let tableListed = false;
  let t = 0;
  const waitIndefinitely = timeout == -1;

  // Continue running until conditional == shouldExist
  // or timeout is reached (if set in config)
  while (exists !== shouldExist && (waitIndefinitely || t < timeout)) {
    outputTimeUpdate(t);
    t++;

    // Check every 5 seconds if table has been restored
    if (t % 5 == 0) {
      let tablesObj = await awsCommand(['dynamodb', 'list-tables']);
      let tables = tablesObj.TableNames;

      // Check that the table exists. Table might show that it exists using list-tables
      // but it might still be loading.
      if (tables.length > 0) {
        tableListed = tables.some((table) => table == chosenTable);
      }

      // We flag if the table is missing and shouldExist is false because
      // this would mean it's deleted and we can send back the response now
      if (tableListed == false && shouldExist == false) {
        return false;
      }

      outputTimeUpdate(t);

      if (tableListed) {
        let tableStatus;
        try {
          const tableDescription = await awsCommand(['dynamodb', 'describe-table', '--table-name', chosenTable]);
          tableStatus = tableDescription?.Table?.TableStatus;
        } catch (error) {
          // If we're looking for a table and it's not found, then it's been deleted
          if (error.name === 'ResourceNotFoundException') {
            exists = false;
          }
        }

        if (tableStatus == 'ACTIVE') {
          exists = true;
        }

        t++;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Only get here after timeout, offer user to keep waiting
  if (exists != shouldExist) {
    let continueChecking = await getConsoleInput(`\n❔ Timed out during checking if table exists - continue waiting?`, [
      'y',
      'n'
    ]);

    if (continueChecking == 'y') {
      exists = await checkTableExists(chosenTable, shouldExist);
    } else {
      console.log(`\nTry running again.`);
      console.log(`\nExiting...`);
      exit();
    }
  }

  return exists;
}

/**
 * Clean up what's been created and lingering in AWS. The only table this deletes
 * is the duplicated table from PITR, otherwise it deletes any backups from the
 * other processes.
 *
 * Note: It will check if the original table exists in DynamoDB before it deletes
 * the backup, in case the original was deleted and then ran into an issue.
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                   contain the operation parameters for their respective operations.
 *
 */
async function cleanAndExit(ops) {
  /*************************************************************
   * Cleaning up the duplicated table from PITR                *
   *************************************************************/
  if (ops.duplicate?.response && ops.duplicate?.response !== null) {
    process.stdout.write(`\n🪣  CLEANING the duplicate [${ops.duplicate.response.TableDescription.TableName}]...`);
    // Check the newly created duplicate exists still
    let duplicateExists = await checkTableExists(ops.duplicate.response.TableDescription.TableName, true);

    if (!duplicateExists) {
      console.log(
        `\n🗂️  Duplicate with name [${ops.duplicate.response.TableDescription.TableName}]. Has it already been deleted?`
      );
    } else {
      await awsCommand(['dynamodb', 'delete-table', '--table-name', ops.duplicate.response.TableDescription.TableName]);
    }
    updateConfirmMessage();
  }

  /*************************************************************
   * Cleaning up any of the original table's DynamoDB Backups  *
   * but ONLY if the original table exists in DynamoDB         *                          *
   *************************************************************/
  let tablesObj = await awsCommand(['dynamodb', 'list-tables']);
  let tables = tablesObj.TableNames;

  let tableListed = false;
  // Check that the table exists. Table might show that it exists using list-tables
  // but it might still be loading.
  if (tables.length > 0) {
    tableListed = tables.some((table) => table == ops.backupDynamoOG?.sourceTable);
  }

  if (tableListed && ops.backupDynamoOG?.response && ops.backupDynamoOG?.response !== null) {
    process.stdout.write(`\n🪣  CLEANING the original backup [${ops.backupDynamoOG.response.BackupName}]...`);
    // Check the newly created backup exists still
    let backupExistsOG = await checkBackupExistsInDynamo(
      ops.backupDynamoOG.sourceTable,
      ops.backupDynamoOG.response.BackupName
    );

    // If it doesn't exist, then it means it wasn't created for some reason.
    if (!backupExistsOG) {
      console.log(`\n💾 Backup with name [${ops.backupDynamoOG.backupName}] has already been deleted.`);
    } else {
      await awsCommand(['dynamodb', 'delete-backup', '--backup-arn', ops.backupDynamoOG.response.BackupArn]);
    }
    updateConfirmMessage();
  } else if (ops.backupDynamoOG?.sourceTable) {
    console.log(`\n❗ Did not find original table [${ops.backupDynamoOG?.sourceTable}]`);
    console.log(`\n❗ SKIPPING DELETING the backup [${ops.backupDynamoOG?.response.BackupName}]...`);
  }

  /*************************************************************
   * Cleaning up any of the duplicate table's DynamoDB Backups *
   *************************************************************/
  if (ops.backupDynamoDupe?.response && ops.backupDynamoDupe?.response !== null) {
    process.stdout.write(`\n🪣  CLEANING the duplicate backup [${ops.backupDynamoDupe.response.BackupName}]...`);
    // Check the newly created backup exists still
    let backupExistsDupe = await checkBackupExistsInDynamo(
      ops.backupDynamoDupe.sourceTable,
      ops.backupDynamoDupe.backupName
    );

    // If it doesn't exist, then it means it wasn't created for some reason.
    if (!backupExistsDupe) {
      console.log(`\n💾 Backup with name [${ops.backupDynamoDupe.response.BackupName}] has already been deleted.`);
    } else {
      await awsCommand(['dynamodb', 'delete-backup', '--backup-arn', ops.backupDynamoDupe.response.BackupArn]);
    }
    updateConfirmMessage();
  }

  console.log('\n✅ Finished cleaning.');

  console.log('\n✨ Reached the end of the process. ✨');
  await backToMenuOrExit();
}

/**
 * Confirm with user if they'd like to initiate the the cleanup following PITR steps
 * or AWS Snapshot steps.
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                   contain the operation parameters for their respective operations.
 *
 */
async function confirmInitiateCleanup(ops) {
  while (true) {
    let initiatedCleanup = await getConsoleInput(
      `\n🪣 Would you like to initiate the cleanup process? This will delete lingering resources created during the restore process. Although this will check (and double check again) and ensure tables are properly created/recreated, you may want to double check in AWS yourself before continuing, or skip this and delete manually in the AWS Console. Initiate cleanup here?`,
      ['y', 'n']
    );

    if (initiatedCleanup == 'y') {
      await cleanAndExit(ops);
      break;
    }
  }
}

/**
 * Ask the user if they would like to complete an action (e.g. remove deletion
 * protection or confirm delete table); if yes, complete action; if no, exit.
 * This is an easier way to preserve history in ops and exit gracefully.
 *
 * @param   {Array}    query - question for user to consider in console.
 * @param   {Array}    yesOrNo - yes or no, expected by getConsoleInput.
 * @param   {Function} action - optional action to be completed if a user continues.
 * @param   {Array}    args - the params for the optional action function
 * @returns {Boolean}  returns if action was completed or if user wishes to exit
 *
 */
async function confirmToContinueYesNo(query, yesOrNo, action = null, args = []) {
  let response = await getConsoleInput(query, yesOrNo);

  if (response == 'y') {
    if (action) {
      try {
        process.stdout.write(`\n⏳ Working on it...`);
        let actionCompleted = await action(...args);

        // Check that action completed and returned a value
        if (actionCompleted) {
          updateConfirmMessage();
          return true;
        }
      } catch (error) {
        throw error;
      }
    } else {
      return true;
    }
  }
}

/**
 * Presents a console-based multiple-choice question to the user and validates their input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @param   {Array}  options - options that the user can select from
 * @returns {Promise} provides the user's input response
 *
 */
async function getConsoleInput(query, options) {
  let optionsPrint = options.join(',');

  if (options.length > 5) {
    optionsPrint = `1 to ${options.length}`;
  }

  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${lineWrap(query)} [${optionsPrint}]\n>> `, async (answer) => {
        if (options.includes(answer.toLowerCase())) {
          rlInterface.close();
          resolve(answer);
        } else if (answer == 'exit') {
          console.log(`\n👋 Exiting...`);
          exit();
        } else if (answer == 'menu' || answer == 'main menu') {
          rlInterface.close();
          await backToMainMenu();
        } else if (answer == 'help') {
          await showHelpOptions();
          rlInterface.close();
          askQuestion();
        } else {
          console.error(
            lineWrap(
              `\nInvalid option - please enter [${optionsPrint}]. Alternatively, you can type 'help' to open a help menu, type 'menu' for the main menu, or type 'exit' to end process.`
            )
          );
          rlInterface.close();
          askQuestion();
        }
      });
    }

    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based question to the user and validates their typed DateTime input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @param   {String} dtOptions - the DateTime format the user can provide
 * @returns {Promise} resolves with the user's DateTime input
 *
 */
async function getDateTimeInput(query, dtOptions, earliestFormatted, latestFormatted) {
  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${query} ${dtOptions}\n>> `, (answer) => {
        answer = answer.trim();

        // Check that the entered DateTime meets the LLL dd yyyy - HH:mm:ss format
        dateTimePattern = /^[a-zA-Z]{3}\s\d{2}\s\d{4}\s-\s\d{2}:\d{2}:\d{2}$/;

        // Check if date and time input is not within the constraints
        if (answer >= earliestFormatted && answer <= latestFormatted) {
          resolve(answer);
        } else if (answer == 'exit') {
          console.log(`\n👋 Exiting...`);
          exit();
        } else if (!dateTimePattern.test(answer)) {
          console.error(`\nInvalid time format, must be format:  LLL dd yyyy - HH:mm:ss`);
          console.error(`Please try again or type 'exit' to end process.\n`);
          rlInterface.close();
          askQuestion();
        } else {
          console.error(`\nInvalid time, must be between [${earliestFormatted}] and [${latestFormatted}]`);
          console.error(`Please try again or type 'exit' to end process.\n`);
          rlInterface.close();
          askQuestion();
        }
      });
    }

    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based question to the user and validates their typed input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String}  query - the question for the user to answer
 * @returns {Promise} resolves with user's input response
 *
 */
async function getDynamoNameInput(query) {
  // Checking for a name that meets the DynamoDB naming conventions
  let dynamoPattern = /^(?:[a-zA-Z0-9_.-]{3,255})+(?:\s|$)$/;

  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${query}\n>> `, (answer) => {
        if (dynamoPattern.test(answer)) {
          resolve(answer);
        } else {
          console.error(`\n❗ Incompatible naming convention for a DynamoDB table.`);
          console.error(
            `\n🗂️  Table names must be between 3 and 255 characters and can only contain the following characters:`
          );
          console.error(`    -  a to z`);
          console.error(`    -  A to Z`);
          console.error(`    -  0 to 9`);
          console.error(`    -  "_" (underscore)`);
          console.error(`    -  "-" (hyphen)`);
          console.error(`    -  "." (period)`);
          rlInterface.close();
          askQuestion();
        }
      });
    }
    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based, multiple-choice question to the user and validates their input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @returns {Number} resolves with the user's number input
 *
 */
async function getNumberInput(query, numberOptions) {
  let numberArray = [];
  for (let i = 1; i <= numberOptions; i++) {
    numberArray.push(i.toString());
  }

  while (true) {
    let choice = await getConsoleInput(query, numberArray);

    // Allow user to exit gracefully
    if (choice == 'n' || choice == 'N') {
      console.log('\nChose to exit.');
      exit();
    }

    // Not a number
    if (!choice.trim()) {
      throw `Please enter a valid number.`;
    }

    const num = Number(choice);

    if (isNaN(num) || !isFinite(num)) {
      throw `That's not a valid number. Please try again.`;
    }

    return num;
  }
}

/**
 * Outputs the time remaining in minutes and seconds. Shows a fun clock emoji.
 *
 * @param   {Number} t - time, in seconds
 *
 */
function outputTimeUpdate(t) {
  let timePassing = [
    '🕐',
    '🕜',
    '🕑',
    '🕝',
    '🕒',
    '🕞',
    '🕓',
    '🕟',
    '🕔',
    '🕠',
    '🕕',
    '🕡',
    '🕖',
    '🕢',
    '🕗',
    '🕣',
    '🕘',
    '🕤',
    '🕙',
    '🕥',
    '🕚',
    '🕦',
    '🕛',
    '🕧'
  ];

  let clock;
  // 24 emojis to show, so we loop through the timePassing array
  if (t < 24) {
    clock = timePassing[t];
  } else {
    clock = timePassing[t % 24];
  }

  // Calculate the minute and seconds
  let m = Math.floor(t / 60);
  let s = t % ((m > 0 ? m : 1) * 60);

  // Only showing a single, 69-character line that's deleted and replaced each iteration
  let messageOutput = `  ${t >= 60 ? m + 'm' + ' ' + s : s}s ${clock}`;
  let messageLength = messageOutput.length;
  let cursorIndex = 69 - messageLength;

  process.stdout.cursorTo(cursorIndex);
  process.stdout.write(`${messageOutput}`);
}

/**
 * Show help information regarding some of the options in the script.
 *
 * @param   {String} targetTable - the selected table
 * @param   {String} backupName - the selected backup name
 *
 */
async function showHelpOptions() {
  while (true) {
    console.warn(`\n*------------------------*                                        `);
    console.warn(`|  HELP OPTIONS           |                                         `);
    console.warn(`*------------------------------------------------------------------*`);
    console.warn(`|  Option    | Item                                                |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    1       |  AWS Backups                                        |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    2       |  AWS Snapshot Process                               |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    3       |  Cold Storage                                       |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    4       |  Deletion Protection                                |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    5       |  DynamoDB Backups                                   |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    6       |  Enabling Deletion Protection                       |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    7       |  Enabling PITR                                      |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    8       |  Point-in-Time (PITR)                               |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    9       |  Point-in-Time (PITR) Recovery Process              |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    10      |  Warm Storage                                       |`);
    console.warn(`*------------------------------------------------------------------*`);

    let helpNeeded = await getNumberInput(`Which item do you require help with?`, 10);

    switch (helpNeeded) {
      case 1:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| AWS        | AWS Backup is a service used to centralize and help |`);
        console.warn(`| Backups    | automate data protection in AWS. AWS Backups can be |`);
        console.warn(`|            | scheduled to be created at just about any date,     |`);
        console.warn(`|            | time, and frequency. AWS Backup allows users to     |`);
        console.warn(`|            | back different types of services/resources and store|`);
        console.warn(`|            | them in a "vault".                                  |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Note: These backups are NOT deleted during these    |`);
        console.warn(`|            | processes.                                          |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 2:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| AWS        | AWS Snapshot is a process that restores a DynamoDB  |`);
        console.warn(`| Snapshot   | table from a backup in AWS Backups within the last  |`);
        console.warn(`| Process    | 1 to 12 months. The user is prompted to select an   |`);
        console.warn(`|            | existing table, and then select an available backup |`);
        console.warn(`|            | from AWS Backups. The process will warn the user if |`);
        console.warn(`|            | if the backup is warm or cold storage.              |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Cleanup can be initiated after the process finishes.|`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 3:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Cold       | Cold storage is a term AWS uses for a type of data  |`);
        console.warn(`| Storage    | storage. Cold storage is one of the lowest costs    |`);
        console.warn(`|            | for storing data in AWS, with the drawback that it  |`);
        console.warn(`|            | takes significantly longer to access it on demand.  |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 4:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Deletion   | Deletion Protection is a property that can be       |`);
        console.warn(`| Protection | enabled on a DynamoDB table to provide a safeguard  |`);
        console.warn(`|            | and avoid accidental table deletion.                |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 5:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| DynamoDB   | DynamoDB has its own backup storage where table     |`);
        console.warn(`| Backups    | data can be stored. This backup storage strategy    |`);
        console.warn(`|            | is used in these scripts to differentiate between   |`);
        console.warn(`|            | the backups made monthly in AWS Backups.            |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Note: These backups CAN be deleted after the        |`);
        console.warn(`|            | processes are complete.                             |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 6:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Enable     | This enables Deletion Protection for a table        |`);
        console.warn(`| Deletion   | immediately. A table with Deletion Protection       |`);
        console.warn(`| Protection | requires another step of confirmation before it can |`);
        console.warn(`|            | deleted by the user.                                |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 7:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Enable     | This enables PITR for a table immediately. PITR is  |`);
        console.warn(`| PITR       | set to be 35 days by default.                       |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 8:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| PITR       | Point-in-Time Recovery (PITR) is a feature in AWS   |`);
        console.warn(`|            | that provides automatic backups of a DynamoDB table |`);
        console.warn(`|            | data. When enabled, PITR snapshots a table every    |`);
        console.warn(`|            | second, up to a maximum of 35 days, so you can      |`);
        console.warn(`|            | restore a table from any point in time in those 35  |`);
        console.warn(`|            | days.                                               |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 9:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| PITR       | Point-in-Time Recovery (PITR) allows you to restore |`);
        console.warn(`| Process    | a table at any point in time in the last 35 days.   |`);
        console.warn(`|            | The process asks you to confirm the table you want  |`);
        console.warn(`|            | to restore, and then confirm a DateTime input:      |`);
        console.warn(`|            | LLL dd yyyy - HH:mm:ss (eg. Jan 23 2025 - 12:30:00).|`);
        console.warn(`|            | The script will then proceed to run a series of     |`);
        console.warn(`|            | duplications and backups to restore the table to    |`);
        console.warn(`|            | that time.                                          |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Cleanup can be initiated after the process finishes.|`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 10:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Warm       | Warm storage is a term AWS uses for a type of data  |`);
        console.warn(`| Storage    | storage. Warm storage is slightly costlier than cold|`);
        console.warn(`|            | storage in AWS, but takes a significantly shorter   |`);
        console.warn(`|            | time to access it on demand.                        |`);
        console.warn(`*------------------------------------------------------------------*`);
    }

    let needMoreHelp = await getConsoleInput(`Still need help?`, ['y', 'n']);

    if (needMoreHelp == 'n') {
      break;
    }
  }
}

/**
 * Outputs the confirmation message to the console
 *
 */
function updateConfirmMessage() {
  process.stdout.cursorTo(67);
  process.stdout.write(`✅          \n`);
}

/**
 * Helps wrap the query message to the console and maintain the max width
 * of 68 characters.
 *
 */

function lineWrap(query, maxLength = 68) {
  const words = query.split(/\s+/);
  let result = [];
  let currentLine = '';
  let charCount = 0;

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    const wordLength = word.length;

    // Some emojis need extra spaces
    emojis = ['💾', '⭐', '❔', '❗'];
    if (/\p{Extended_Pictographic}/u.test(word) && !emojis.some((emoji) => word.includes(emoji))) {
      word = word + ' ';
    }

    if (charCount + wordLength > maxLength) {
      // If adding the word would exceed the limit, start a new line
      if (wordLength > maxLength) {
        // If the word itself is too long, split it across multiple lines
        while (wordLength > maxLength) {
          result.push(word.slice(0, maxLength));
          word = word.slice(maxLength);
          wordLength -= maxLength;
        }
        result.push(word);
      } else {
        // Add the current line to the result and reset it
        result.push(currentLine.trim());
        currentLine = word + ' ';
        charCount = wordLength + 1;
      }
    } else {
      // Add the word to the current line
      currentLine += word + ' ';
      charCount += wordLength + 1;
    }
  }

  if (currentLine.trim()) {
    result.push(currentLine.trim());
  }

  return '\n' + result.join('\n');
}

module.exports = {
  activateReadline,
  awsCommand,
  backToMainMenu,
  backToMenuOrExit,
  checkAndUpdate,
  checkBackupExistsInDynamo,
  checkConfig,
  checkTableExists,
  cleanAndExit,
  confirmInitiateCleanup,
  confirmToContinueYesNo,
  exit,
  getConsoleInput,
  getDateTimeInput,
  getDynamoNameInput,
  getNumberInput,
  updateConfirmMessage,
  lineWrap
};
