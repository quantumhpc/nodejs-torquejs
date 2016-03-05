var cproc = require('child_process');
var spawn = cproc.spawnSync;

// SSH executable
var ssh_exec = "ssh";
// Load credentials to remotly connect to PBS server
var pbs_creds = require("./config/pbsserver.json");


// Parse the remote command and transform it for child_procss
// TODO: treat errors
function spawnSshProcess(command,username,serverName,serverKey,remote_cmd){
    var sshCommand = [username + "@" + serverName,"-i",serverKey].concat(remote_cmd.split(" "));
    //Return stdout of the process
    return spawn(command, sshCommand, { encoding : 'utf8' }).stdout;
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
    for (var i = 0; i < output.length; i++) {
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
    console.log(output);
    results = {
        'name'      :   output[1],
        'user'      :   output[2],
        'time'      :   output[3],
        'status'    :   status[output[4]],
        'queue'     :   output[5],
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
    var output = spawnSshProcess(ssh_exec, pbs_creds.username, pbs_creds.serverName, pbs_creds.secretAccessKey, remote_cmd);
    //Separate each node
    var output = output.split('\n\n');
    var nodes = {};
    //Loop on each node, the last one is blank due to \n\n
    for (var i = 0; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\n,]+/);
        //1st entry is the node name
        nodes[output[i][0]] = jsonifyQnodes(output[i]);
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
    var output = spawnSshProcess(ssh_exec, pbs_creds.username, pbs_creds.serverName, pbs_creds.secretAccessKey, remote_cmd);
    output = output.split('\n');
    // First 2 lines are not relevant
    var jobs = {};
    for (var i = 2; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\s]+/);
        //1st entry is the job Id
        jobs[output[i][0]] = jsonifyQstat(output[i]);
    }
    return jobs;
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
    var output = spawnSshProcess(ssh_exec, pbs_creds.username, pbs_creds.serverName, pbs_creds.secretAccessKey, remote_cmd);
    output = output.split('\n');
    var results = jsonifyQmgr(output);
    
    return results;
}

module.exports = {
    qnodes_js   : qnodes_js,
    qstat_js    : qstat_js,
    qmgr_js     : qmgr_js,
};
