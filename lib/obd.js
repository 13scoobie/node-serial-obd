'use strict';
//Used for event emitting.
var EventEmitter = require('events').EventEmitter;
var util = require('util');
// obdInfo.js for all PIDS.
var PIDS = require('../lib/obdInfo.js');

// Class OBDReader
var OBDReader;

/**
 * Creates an instance of OBDReader.
 * @constructor
 * @this {OBDReader}
 */
OBDReader = function () {

    EventEmitter.call(this);
    this.connected = false;
    this.receivedData = "";

    return this;
};
util.inherits(OBDReader, EventEmitter);

/**
 * Find a PID-value by name.
 * @param name Name of the PID you want the hexadecimal (in ASCII text) value of.
 * @return {string} PID in hexadecimal ASCII
 */
function getPIDByName(name) {
    var i;
    for (i = 0; i < PIDS.length; i++) {
        if (PIDS[i].name === name) {
            if (PIDS[i].pid !== undefined) {
                return (PIDS[i].mode + PIDS[i].pid);
            } else { //There are modes which don't require a extra parameter ID.
                return (PIDS[i].mode);
            }
        }
    }
}
/**
 * Parses a hexadecimal string to a reply object. Uses PIDS. (obdInfo.js)
 * @param {string} hexString Hexadecimal value in string that is received over the serialport.
 * @return {Object} reply - The reply.
 * @return {string} reply.value - The value that is already converted. This can be a PID converted answer or "OK" or "NO DATA".
 * @return {string} reply.name - The name. --! Only if the reply is a PID.
 * @return {string} reply.mode - The mode of the PID. --! Only if the reply is a PID.
 * @return {string} reply.pid - The PID. --! Only if the reply is a PID.
 */
function parseOBDCommand(hexString) {
    var reply = {}; //New object

    if(hexString === "NO DATA" || hexString === "OK"){ //No data or OK is the response.
        reply.value = hexString;
        return reply;
    }

    hexString = hexString.replace(/ /g, ''); //Whitespace trimming
    var valueArray = [];

    for (var byteNumber = 0; byteNumber < hexString.length; byteNumber += 2) {
        valueArray.push(hexString.substr(byteNumber, 2));
    }

    reply.mode = valueArray[0];
    reply.pid = valueArray[1];

    for (var i = 0; i < PIDS.length; i++) {
        if(PIDS[i].pid == reply.pid) {
            var numberOfBytes = PIDS[i].bytes;
            reply.name = PIDS[i].name;
            switch (numberOfBytes)
            {
                case 1:
                    reply.value = PIDS[i].convertToUseful(valueArray[2]);
                    break;
                case 2:
                    reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3]);
                    break;
                case 4:
                    reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3], valueArray[4], valueArray[5]);
                    break;
                case 8:
                    reply.value = PIDS[i].convertToUseful(valueArray[2], valueArray[3], valueArray[4], valueArray[5], valueArray[6], valueArray[7], valueArray[8], valueArray[9]);
                    break;
            }
            break; //Value is converted, break out the for loop.
        }
    }
    return reply;
}
/**
 * Connect/Open the serial port and add events to serialport.
 * @this {OBDReader}
 */
OBDReader.prototype.connect = function () {
    var self = this; //Enclosure!

    var SerialPort = require('serialport').SerialPort;

    this.SERIAL_PORT = "/dev/rfcomm0";
    this.BAUD_RATE = 115200;
    this.serial = new SerialPort(this.SERIAL_PORT, {
        baudrate: this.BAUD_RATE
    });

    this.serial.on('close', function (err) {
        console.log("Serial port [" + self.SERIAL_PORT + "] was closed");
    });

    this.serial.on('error', function (err) {
        console.log("Serial port [" + self.SERIAL_PORT + "] is not ready");
    });

    this.serial.on('open', function () {
        self.connected = true;
        console.log('connected');
        //Event connected
        self.emit('connected');
    });

    this.serial.on("data", function (data) {
        var currentString, indexOfEnd, arrayOfCommands;
        currentString = self.receivedData + data.toString('utf8'); // making sure it's a utf8 string

        arrayOfCommands = currentString.split('>');

        var forString;
        if(arrayOfCommands.length < 2) {
            self.receivedData = arrayOfCommands[0];
        } else {
            for(var commandNumber = 0; commandNumber < arrayOfCommands.length; commandNumber++) {
                forString = arrayOfCommands[commandNumber];
                if(forString === '') {
                    continue;
                }
                indexOfEnd = forString.lastIndexOf('\r\n');

                if (indexOfEnd > -1) {
                    var indexOfStart, reply;
                    forString = forString.substr(0, indexOfEnd); //Discard end
                    indexOfStart = forString.lastIndexOf('\r\n'); //Find start
                    forString = forString.substr(indexOfStart + 2, currentString.length); //Discard start
                    reply = parseOBDCommand(forString);
                    //Event dataReceived.
                    self.emit('dataReceived', reply);
                    self.receivedData = '';
                } else {
                    console.log('Error in parsing.');
                }
            }
        }

    });

};
/**
 * Disconnects/closes the port.
 * @this {OBDReader}
 */
OBDReader.prototype.disconnect = function () {
    this.serial.close();
    this.connected = false;
};
/**
 * Writes a message to the port.
 * @this {OBDReader}
 * @param {string} message The PID or AT Command you want to send. Without \r or \n!
 */
OBDReader.prototype.write = function (message) {
    this.serial.write(message + '\r');
};
/**
 * Writes a PID value by entering a pid supported name.
 * @this {OBDReader}
 * @param {string} name Look into obdInfo.js for all PIDS.
 */
OBDReader.prototype.requestValueByName = function (name) {
    this.write(getPIDByName(name));
};

var activePollers = [];
/**
 * Adds a poller to the poller-array.
 * @this {OBDReader}
 * @param {string} name Name of the poller you want to add.
 */
OBDReader.prototype.addPoller = function (name) {
    var stringToSend = getPIDByName(name);
    activePollers.push(stringToSend);
};
/**
 * Removes an poller.
 * @this {OBDReader}
 * @param {string} name Name of the poller you want to remove.
 */
OBDReader.prototype.removePoller = function (name) {
    var stringToDelete = getPIDByName(name);
    var index = activePollers.indexOf(stringToDelete);
    activePollers.splice(index, 1);
};
/**
 * Removes all pollers.
 * @this {OBDReader}
 */
OBDReader.prototype.removeAllPollers = function () {
    activePollers.length = 0; //This does not delete the array, it just clears every element.
};
/**
 * Writes all active pollers.
 * @this {OBDReader}
 */
OBDReader.prototype.writePollers = function () {
    var i;
    for (i = 0; i < activePollers.length; i++) {
        this.write(activePollers[i]);
    }
};

var pollerInterval;
/**
 * Starts polling.
 * @this {OBDReader}
 */
OBDReader.prototype.startPolling = function () {
    var self = this;
    pollerInterval = setInterval(function () {
        self.writePollers();
    }, 3000);
};
/**
 * Stops polling.
 * @this {OBDReader}
 */
OBDReader.prototype.stopPolling = function () {
    clearTimeout(pollerInterval);
};


var exports = module.exports = OBDReader;
