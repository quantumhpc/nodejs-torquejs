var cproc = require('child_process');
var spawn = cproc.spawnSync;


// Load credentials to remotly connect to PBS server
var pbs_creds = require("./config/pbsserver.json");
// SSH executable
var ssh_exec = "/usr/bin/ssh";
// Local Shell
var local_exec = "/bin/sh";

// Parse the command and return stdout of the process depending on the method
// TODO: treat errors
function spawnProcess(remote_cmd){
    // Remote pbs server
    if (pbs_creds.method == "ssh"){
        var spawnCommand = [pbs_creds.username + "@" + pbs_creds.serverName,"-i",pbs_creds.secretAccessKey].concat(remote_cmd.split(" "));
        return spawn(ssh_exec, spawnCommand, { encoding : 'utf8' });
    }
    // Local server on the same machine as the node process
    if (pbs_creds.method == "local"){
        return spawn(local_exec, remote_cmd.split(" "), { encoding : 'utf8' });
    }
}


//Takes an array to convert to JSON tree with an array of descending keys and the value of the last key
function jsonifyQmgr(output){
    var results={};
    for (var i = 0; i < output.length; i++) {
        if (output[i].indexOf('=')!== -1){
            // Split key and value to 0 and 1
            var data = output[i].split('=');
            // Split at each space to create a node in JSON
            var keys = data[0].trim().split(' ');
            var value = data[1];
            //TODO: do this more effentiely
            switch (keys.length){
                case 3:
                    results[keys[1]] = results[keys[1]] || {}; // initializes array if it is undefined
                    results[keys[1]][keys[2].trim()] = value.trim();
                    break;
                case 4:
                    results[keys[1].trim()] = results[keys[1]] || {}; // initializes array if it is undefined
                    results[keys[1]][keys[2].trim()] = results[keys[1]][keys[2].trim()] || {}; // initializes array if it is undefined
                    results[keys[1]][keys[2].trim()][keys[3].trim()] = value.trim();
                    break;
            }
        }
    }
    
    return results;
}

function jsonifyQnodes(output){
    var results={};
    // Store node name
    results["name"] = output[0];
    // Look for properties
    for (var i = 1; i < output.length; i++) {
        if (output[i].indexOf('=')!== -1){
            // Split key and value to 0 and 1
            var data = output[i].split('=');
            results[data[0].trim()] = data[1].trim();
        }
    }
    return results;
}

function jsonifyQstat(output){
    var results={};
    var status = {'Q' : 'Queued', 'R' : 'Running', 'C' : 'Completed', 'E' : 'Error'};
    results = {
        "jobId"     :   output[0],
        "name"      :   output[1],
        "user"      :   output[2],
        "time"      :   output[3],
        "status"    :   status[output[4]],
        "queue"     :   output[5],
    };
    return results;
}

// Return the list of nodes
function qnodes_js(nodeName){
    var remote_cmd = "qnodes";
    // Info on a specific node
    if(nodeName != undefined) {
        remote_cmd += " " + nodeName;
    }
    var output = spawnProcess(remote_cmd);
    //Separate each node
    var output = output.split('\n\n');
    var nodes = [];
    //Loop on each node, the last one is blank due to \n\n
    for (var i = 0; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\n,]+/);
        nodes.push(jsonifyQnodes(output[i]));
    }
    return nodes;
}

// Return list of running jobs
// TODO: implement qstat -f
function qstat_js(jobId){
    var remote_cmd = "qstat";
    // Full information on a job
    if(jobId != undefined) {
        remote_cmd += " -f " + jobId;
    }
    var output = spawnProcess(remote_cmd).stdout;
    output = output.split('\n');
    // First 2 lines are not relevant
    var jobs = [];
    for (var i = 2; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\s]+/);
        jobs.push(jsonifyQstat(output[i]));
    }
    return jobs;
}

// Interface for qdel
// Delete the specified job Id
function qdel_js(jobId){
    var remote_cmd = "qdel";
    if(jobId == undefined) {
        return 'Please specify the jobId';
    }else{
        // Default print everything
        remote_cmd += " " + jobId;
    }
    var output = spawnProcess(remote_cmd);
    // Transmit the error if any
    if (output.stderr){
        return output.stderr;
    }
    // Job deleted returns 0 exit code
    if (output.status == 0){
        return 'Job successfully deleted';   
    }
}

// Interface for qmgr
// For now only display server info
function qmgr_js(qmgrCmd){
    var remote_cmd = "qmgr -c ";
    if(qmgrCmd != undefined) {
        remote_cmd += qmgrCmd;
    }else{
        // Default print everything
        remote_cmd += "'p s'";
    }
    var output = spawnProcess(remote_cmd).stdout;
    output = output.split('\n');
    var results = jsonifyQmgr(output);
    
    return results;
}

module.exports = {
    qnodes_js   : qnodes_js,
    qstat_js    : qstat_js,
    qmgr_js     : qmgr_js,
    qdel_js     : qdel_js,
};