/* 
* Copyright (C) 2015-2016 Quantum HPC Inc.
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var cproc = require('child_process');
var spawn = cproc.spawnSync;
var fs = require("fs");
var path = require("path");
var jobStatus = {'Q' : 'Queued', 'R' : 'Running', 'C' : 'Completed', 'E' : 'Exiting', 'H' : 'Held', 'T' : 'Moving', 'W' : 'Waiting'};
// General command dictionnary keeping track of implemented features
var cmdDict = {
    "queue"    :   ["qstat", "-Q"],
    "queues"   :   ["qstat", "-Q"],
    "job"      :   ["qstat", "-f"],
    "jobs"     :   ["qstat"],
    "node"     :   ["qnodes"],
    "nodes"    :   ["qnodes"],
    "submit"   :   ["qsub"],
    "delete"   :   ["qdel"],
    "setting"  :   ["qmgr", "-c"],
    "settings" :   ["qmgr", "-c","'p s'"]
    };

var nodeControlCmd = {
    'clear'     :  ["-c"],
    'offline'   :  ["-o"],
    'reset'     :  ["-r"]
};

// Helper function to return an array with [full path of exec, arguments] from a command of the cmdDict
function cmdBuilder(binPath, cmdDictElement){
    return [path.join(binPath, cmdDictElement[0])].concat(cmdDictElement.slice(1,cmdDictElement.length));
}
// Parse the command and return stdout of the process depending on the method
/*
    spawnCmd                :   shell command   /   [file, destinationDir], 
    spawnType               :   shell           /   copy, 
    spawnDirection          :   null            /   send || retrieve, 
    torque_config
*/
// TODO: treat errors
function spawnProcess(spawnCmd, spawnType, spawnDirection, torque_config){
    var spawnExec;
    // UID and GID throw a core dump if not correct numbers
    if ( Number.isNaN(torque_config.uid) || Number.isNaN(torque_config.gid) ) {
        return {stderr : "Please specify valid uid/gid"};
    }  
    var spawnOpts = { encoding : 'utf8', uid : torque_config.uid , gid : torque_config.gid};
    switch (spawnType){
        case "shell":
            switch (torque_config.method){
                case "ssh":
                    spawnExec = torque_config.ssh_exec;
                    spawnCmd = [torque_config.username + "@" + torque_config.serverName,"-o","StrictHostKeyChecking=no","-i",torque_config.secretAccessKey].concat(spawnCmd);
                    break;
                case "local":
                    spawnExec = spawnCmd.shift();
                    spawnOpts.shell = torque_config.local_shell;
                    break; 
            }
            break;
        //Copy the files according to the spawnCmd array : 0 is the file, 1 is the destination dir
        case "copy":
            // Special case if we can use a shared file system
            if (torque_config.useSharedDir){
                spawnExec = torque_config.local_copy;
                spawnOpts.shell = torque_config.local_shell;
            }else{
                switch (torque_config.method){
                    // Build the scp command
                    case "ssh":
                        spawnExec = torque_config.scp_exec;
                        var file;
                        var destDir;
                        switch (spawnDirection){
                            case "send":
                                file    = spawnCmd[0];
                                destDir = torque_config.username + "@" + torque_config.serverName + ":" + spawnCmd[1];
                                break;
                            case "retrieve":
                                file    = torque_config.username + "@" + torque_config.serverName + ":" + spawnCmd[0];
                                destDir = spawnCmd[1];
                                break;
                        }
                        spawnCmd = ["-o","StrictHostKeyChecking=no","-i",torque_config.secretAccessKey,file,destDir];
                        break;
                    case "local":
                        spawnExec = torque_config.local_copy;
                        spawnOpts.shell = torque_config.local_shell;
                        break;
                }
            }
            break;
    }
    return spawn(spawnExec, spawnCmd, spawnOpts);
}

function createUID()
{
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

// Create a unique working directory in the global working directory from the config
function createJobWorkDir(torque_config, callback){
    // Get configuration working directory and Generate a UID for the working dir
    var jobWorkingDir = path.join(torque_config.working_dir,createUID());
    
    //Create workdir with 700 permissions
    var process = spawnProcess(["[ -d "+jobWorkingDir+" ] || mkdir -m 700 "+jobWorkingDir],"shell", null, torque_config);
    
    // Transmit the error if any
    if (process.stderr){
        return callback(new Error(process.stderr));
    }
    //TODO:handles error
    return callback(null, jobWorkingDir);
}


//Takes an array to convert to JSON tree for queues and server properties
function jsonifyQmgr(output){
    var results=[];
    // JSON output will be indexed by queues and server
    results.queue=[];
    results.queues=[];
    results.server={};
    //Loop on properties
    for (var i = 0; i < output.length; i++) {
        if (output[i].indexOf('=') !== -1){
            // Split key and value to 0 and 1
            var data = output[i].split('=');
            // Split at each space to create a node in JSON
            var keys = data[0].trim().split(' ');
            var value = data[1].trim();
            //TODO: do this more effentiely
            switch (keys[1].trim()){
                case 'server':
                    results.server[keys[2].trim()] = value;
                    break;
                case 'queue':
                    // Order array under the queue name to easily store properties
                    results.queue[keys[2].trim()] = results.queue[keys[2].trim()] || {}; // initializes array if it is undefined
                    results.queue[keys[2].trim()][keys[3].trim()] = value;
                    break;
            }
        }
    }
    // Loop on the sub-array 'queue' to reorganise it more JSON-like
    for (var x in results.queue){
        // Add the name of the queue
        results.queue[x].name = x;
        results.queues.push(results.queue[x]);
    }
    // Clear the sub-array
    delete results.queue;
    
    return results;
}

function jsonifyQnodes(output){
    var results={};
    // Store node name
    results.name = output[0];
    // Look for properties
    for (var i = 1; i < output.length; i++) {
        if (output[i].indexOf('=')!== -1){
           // Split key and value to 0 and 1
            var data = output[i].split('=');
            results[data.shift().trim()] = data.toString().trim();
                
        }
    }
    // Reorganise jobs into an array with jobId & jobProcs
    if (results.jobs){
        var runningJobs = [];
        var jobData = results.jobs.trim().split(/[,/]+/);
        // Parse jobs and forget trailing comma
        for (var j = 0; j < jobData.length-1; j+=2) {
            var newJob = {
                jobId       :   jobData[j+1],
                jobProcs    :   jobData[j],
            };
            runningJobs.push(newJob);
        }
        results.jobs = runningJobs;
    }
    // Reorganise status
    if (results.status){
        var tmpStatus = {};
        var statusData = results.status.trim().split(/[,]+/);
        for (var k = 0; k < statusData.length; k+=2) {
            // Skip jobs inside status for now : TODO: store those information
            if (statusData[k] == 'jobs'){
                while (statusData[k] != 'state'){
                    k++;
                }
            }
            // Create new array
            tmpStatus[statusData[k]] = statusData[k+1];
        }
        results.status = tmpStatus;
    }
    return results;
}

function jsonifyQstat(output){
    var results = {
        "jobId"     :   output[0],
        "name"      :   output[1],
        "user"      :   output[2],
        "time"      :   output[3],
        "status"    :   jobStatus[output[4]],
        "queue"     :   output[5],
    };
    return results;
}

function jsonifyQueues(output){
    var results = {
        "name"        :   output[0],
        "maxJobs"     :   output[1],
        "totalJobs"   :   output[2],
        "enabled"     :   (output[3] === 'yes' ? true : false),
        "started"     :   (output[4] === 'yes' ? true : false),
        "queued"      :   output[5],
        "running"     :   output[6],
        "held"        :   output[7],
        "waiting"     :   output[8],
        "moving"      :   output[9],
        "exiting"     :   output[10],
        "type"        :   (output[11] === 'E' ? 'Execution' : 'Routing'),
        "completed"   :   output[12]
    };
    return results;
}

function jsonifyQstatF(output){
    var results={};
    // First line is Job Id
    results.jobId = output[0].split(':')[1].trim();
    
    // Look for properties
    for (var i = 1; i < output.length; i++) {
        if (output[i].indexOf(' = ')!== -1){
            // Split key and value to 0 and 1
            var data = output[i].split(' = ');
            results[data[0].trim()] = data[1].trim();   
        }
    }
    
    // Develop job status to be consistent
    results.job_state = jobStatus[results.job_state];
    
    // Reorganise variable list into a sub-array
    if (results.Variable_List){
        var variables = results.Variable_List.trim().split(/[=,]+/);
        results.Variable_List = {};
        for (var k = 0; k < variables.length; k+=2) {
            results.Variable_List[variables[k]] = variables[k+1];
        }
    }
    return results;
}


// Generate the script to run the job and write it to the specified path
// Job Arguments taken in input : TO COMPLETE
// Return the full path of the SCRIPT
/* jobArgs = {
    shell           :   String      //  '/bin/bash'
    jobName         :   String      //  'XX'
    ressources      :   String      //  'nodes=X:ppn=X or select=X'
    walltime        :   String      //  'walltime=01:00:00'
    workdir         :   String      //  '-d'
    stdout          :   String      //  '-o'
    stderr          :   String      //  '-e'
    queue           :   String      //  'batch'
    exclusive       :   Boolean     //  '-n'
    mail            :   String      //  'myemail@mydomain.com'
    mailAbort       :   Boolean     //  '-m a'
    mailBegins      :   Boolean     //  '-m b'
    mailTerminates  :   Boolean     //  '-m e'
    commands        :   Array       //  'main commands to run'
    },
    localPath   :   'path/to/save/script'
    callback    :   callback(err,scriptFullPath)
}*/
// TODO: Consider piping the commands to qsub instead of writing script
function qscript_js(jobArgs, localPath, callback){
    // General torque command inside script
    var torquecommand = "#torque ";
    var toWrite = "# Autogenerated script";
    
    var jobName = jobArgs.jobName;
    
    // The name has to be bash compatible: TODO expand to throw other erros
    if (jobName.search(/[^a-zA-Z0-9]/g) !== -1){
        return callback(new Error('Name cannot contain special characters'));
    }

    // Generate the script path
    var scriptFullPath = path.join(localPath,jobName);
    
    // Job Shell
    toWrite += "\n" + torquecommand + "-S " + jobArgs.shell;
    
    // Job Name
    toWrite += "\n" + torquecommand + "-N " + jobName;
    
    // Workdir
    toWrite += "\n" + torquecommand + "-d " + jobArgs.workdir;
    
    // Stdout
    if (jobArgs.stdout !== undefined && jobArgs.stdout !== ''){
        toWrite += "\n" + torquecommand + "-o " + jobArgs.stdout;
    }
    // Stderr
    if (jobArgs.stderr !== undefined && jobArgs.stderr !== ''){
        toWrite += "\n" + torquecommand + "-e " + jobArgs.stderr;
    }
    
    // Ressources
    toWrite += "\n" + torquecommand + "-l " + jobArgs.ressources;
    
    // Walltime: optional
    if (jobArgs.walltime !== undefined && jobArgs.walltime !== ''){
        toWrite += "\n" + torquecommand + "-l " + jobArgs.walltime;
    }
    
    // Queue
    toWrite += "\n" +  torquecommand + "-q " + jobArgs.queue;
    
    // Job exclusive
    if (jobArgs.exclusive){
        toWrite += "\n" + torquecommand + "-n";
    }
    
    // Send mail
    if (jobArgs.mail){
    
    toWrite += "\n" + torquecommand + "-M " + jobArgs.mail;
    
        // Test when to send a mail
        var mailArgs;
        if(jobArgs.mailAbort){mailArgs = '-m a';}
        if(jobArgs.mailBegins){     
          if (!mailArgs){mailArgs = '-m b';}else{mailArgs += 'b';}
        }
        if(jobArgs.mailTerminates){     
          if (!mailArgs){mailArgs = '-m e';}else{mailArgs += 'e';}
        }
        
        if (mailArgs){
            toWrite += "\n" + torquecommand + mailArgs;
        }
    }
    
    // Write commands in plain shell including carriage returns
    toWrite += "\n" + jobArgs.commands;
    
    toWrite += "\n";
    // Write to script
    fs.writeFileSync(scriptFullPath,toWrite);
    
    return callback(null, {
        "message"   :   'Script for job ' + jobName + ' successfully created',
        "path"      :   scriptFullPath
        });
}

// Return the list of nodes
function qnodes_js(torque_config, controlCmd, nodeName, callback){
    // controlCmd & nodeName are optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    torque_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd;
    var parseOutput = true;
    
    // Command, Nodename or default
    switch (args.length){
        case 2:
            // Node control
            nodeName = args.pop();
            controlCmd = args.pop();
            remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.node);
            remote_cmd = remote_cmd.concat(nodeControlCmd[controlCmd]);
            remote_cmd.push(nodeName);
            parseOutput = false;
            break;
        case 1:
            // Node specific info
            nodeName = args.pop();
            remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.node);
            remote_cmd.push(nodeName);
            break;
        default:
            // Default
            remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.nodes);
    }
    
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr));
    }
    
    if (parseOutput){    
        //Detect empty values
        output = output.stdout.replace(/=,/g,"=null,");
        //Separate each node
        output = output.split('\n\n');
        var nodes = [];
        //Loop on each node
        for (var j = 0; j < output.length; j++) {
            if (output[j].length>1){
                //Split at lign breaks
                output[j]  = output[j].trim().split(/[\n;]+/);
                nodes.push(jsonifyQnodes(output[j]));
            }
        }
        return callback(null, nodes);
    }else{
        return callback(null, { 
            "message"   : 'Node ' + nodeName + ' put in ' + controlCmd + ' state.',
        });
    }
}

// Return list of queues
function qqueues_js(torque_config, queueName, callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    
    // first argument is the config file
    torque_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd;
    
    // Info on a specific job
    if (args.length == 1){
        queueName = args.pop();
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.queue);
        remote_cmd.push(queueName);
    }else{
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.queues);
    }
    
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr));
    }
    
    output = output.stdout.split('\n');
    // First 2 lines are not relevant
    var queues = [];
    for (var j = 2; j < output.length-1; j++) {
        output[j]  = output[j].trim().split(/[\s]+/);
        queues.push(jsonifyQueues(output[j]));
    }
    return callback(null, queues);
    
}
    
// Return list of running jobs
// TODO: implement qstat -f
function qstat_js(torque_config, jobId, callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    // Boolean to indicate if we want the job list
    var jobList = true;
    
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    torque_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd;
    
    // Info on a specific job
    if (args.length == 1){
        jobId = args.pop();
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.job);
        remote_cmd.push(jobId);
        jobList = false;
    }else{
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.jobs);
    }
    
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr));
    }
    
    // If no error but zero length, the user is has no job running or is not authorized
    if (output.stdout.length === 0){
        return callback(null,[]);
    }
    
    if (jobList){
        output = output.stdout.split('\n');
        // First 2 lines are not relevant
        var jobs = [];
        for (var j = 2; j < output.length-1; j++) {
            output[j]  = output[j].trim().split(/[\s]+/);
            jobs.push(jsonifyQstat(output[j]));
        }
        return callback(null, jobs);
    }else{
        output = output.stdout.replace(/\n\t/g,"").split('\n');
        output = jsonifyQstatF(output);
        return callback(null, output);
    }
}

// Interface for qdel
// Delete the specified job Id and return the message and the status code
function qdel_js(torque_config,jobId,callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    torque_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.delete);
    
    if (args.length !== 1){
        // Return an error
        return callback(new Error('Please specify the jobId'));
    }else{
        jobId = args.pop();
        remote_cmd.push(jobId);
    }
    
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr));
    }
    // Job deleted returns
    return callback(null, {"message" : 'Job ' + jobId + ' successfully deleted'});
}

// Interface for qmgr
// For now only display server info
function qmgr_js(torque_config, qmgrCmd, callback){
    // qmgrCmd is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    torque_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = torque_config.binaries_dir;
    if (args.length === 0){
        // Default print everything
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.settings);
    }else{
        // TODO : handles complex qmgr commands
        remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.setting);
        remote_cmd.push(args.pop());
        return callback(new Error('not yet implemented'));
    }
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr));
    }
    
    output = output.stdout.split('\n');
    var qmgrInfo = jsonifyQmgr(output);
    
    return callback(null, qmgrInfo);
}


// Interface for qsub
// Submit a script by its absolute path
// qsub_js(
/*    
        torque_config      :   config,
        qsubArgs        :   array of required files to send to the server with the script in 0,
        jobWorkingDir   :   working directory,
        callack(message, jobId, jobWorkingDir)
}
*/
function qsub_js(torque_config, qsubArgs, jobWorkingDir, callback){
    var remote_cmd = cmdBuilder(torque_config.binaries_dir, cmdDict.submit);
    
    if(qsubArgs.length < 1) {
        return callback(new Error('Please submit the script to run'));  
    }
    
    // Create a workdir if not defined
    // TODO: - test if accessible
    // var jobWorkingDir = createJobWorkDir(torque_config);
    
    // Send files by the copy command defined
    for (var i = 0; i < qsubArgs.length; i++){
        var copyCmd = spawnProcess([qsubArgs[i],jobWorkingDir],"copy","send",torque_config);
        if (copyCmd.stderr){
            return callback(new Error(copyCmd.stderr.replace(/\n/g,"")));
        }
    }
    // Add script: first element of qsubArgs
    var scriptName = path.basename(qsubArgs[0]);
    remote_cmd.push(path.join(jobWorkingDir,scriptName));
    
    // Add directory to submission args to copy back error and output logs
    remote_cmd.push("-d",jobWorkingDir);
    
    // Submit
    var output = spawnProcess(remote_cmd,"shell",null,torque_config);
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr.replace(/\n/g,"")));
    }
    
    var jobId = output.stdout.replace(/\n/g,"");
    return callback(null, { 
            "message"   : 'Job ' + jobId + ' submitted',
            "jobId"     : jobId,
            "path"      : jobWorkingDir
        });
}

// Interface to retrieve the files from a completed job
// Takes the jobId
/* Return {
    callack(message)
}*/

function qfind_js(torque_config, jobId, callback){
    
    // Check if the user is the owner of the job
    qstat_js(torque_config,jobId, function(err,data){
        if(err){
            return callback(err,data);
        }
        
        // Check if the user downloads the appropriate files
        var jobWorkingDir = path.resolve(data.Variable_List.torque_O_WORKDIR);
        
        // Remote find command
        // TOOD: put in config file
        var remote_cmd = ["find", jobWorkingDir,"-type f", "&& find", jobWorkingDir, "-type d"];
        
        // List the content of the working dir
        var output = spawnProcess(remote_cmd,"shell",null,torque_config);
        // Transmit the error if any
        if (output.stderr){
            return callback(new Error(output.stderr.replace(/\n/g,"")));
        }
        output = output.stdout.split('\n');
        
        var fileList        = [];
        fileList.files      = [];
        fileList.folders    = [];
        var files = true;
        
        for (var i=0; i<output.length; i++){
            var filePath = output[i];
            if (filePath.length > 0){
                
                // When the cwd is returned, we have the folders
                if (path.resolve(filePath) === path.resolve(jobWorkingDir)){
                    files = false;
                }
                if (files){
                    fileList.files.push(path.resolve(output[i]));
                }else{
                    fileList.folders.push(path.resolve(output[i]));
                }
            }
        }
        return callback(null, fileList);
        
    });

}

function qretrieve_js(torque_config, jobId, fileList, localDir, callback){
    
    // Check if the user is the owner of the job
    qstat_js(torque_config,jobId, function(err,data){
        if(err){
            return callback(err,data);
        }
        
        // Check if the user downloads the appropriate files
        var jobWorkingDir = path.resolve(data.Variable_List.torque_O_WORKDIR);
        
        for (var file in fileList){
            var filePath = fileList[file];
            
            // Compare the file location with the working dir of the job
            if(path.dirname(filePath) !== jobWorkingDir){
                return callback(new Error(path.basename(filePath) + ' is not related to the job ' + jobId));
            }
            
            // Retrieve the file
            // TODO: treat individual error on each file
            var copyCmd = spawnProcess([filePath,localDir],"copy","retrieve",torque_config);
            if (copyCmd.stderr){
                return callback(new Error(copyCmd.stderr.replace(/\n/g,"")));
            }
        }
        return callback(null,{
            "message"   : 'Files for the job ' + jobId + ' have all been retrieved in ' + localDir
        });
    });

}

module.exports = {
    qnodes_js           : qnodes_js,
    qstat_js            : qstat_js,
    qqueues_js          : qqueues_js,
    qmgr_js             : qmgr_js,
    qdel_js             : qdel_js,
    qsub_js             : qsub_js,
    qscript_js          : qscript_js,
    qretrieve_js        : qretrieve_js,
    qfind_js            : qfind_js,
    createJobWorkDir    : createJobWorkDir,
};
