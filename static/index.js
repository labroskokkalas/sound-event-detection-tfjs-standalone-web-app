let webWorker = null;
let workerModelIsReady = false;
let interval = null;
let audioContext = null;
let wakeLock = null;

let mediaRecorder = null;
let recBuffers = [];
let results = [];
let counter = 0;
let inferenceTime = 0;
var max = 0;
var d = new Date();
let startTime = 0;
let recorderStopped = false;
let DOM_EL = {
    record: null,
    stop: null,
    spinner: null
}

window.addEventListener('DOMContentLoaded', () => {
    // assign references
    DOM_EL.record = document.querySelector('.record');
    DOM_EL.stop = document.querySelector('.stop');
    DOM_EL.spinner = document.getElementById('spinner')
    DOM_EL.messages = document.getElementById('messages')
    DOM_EL.record.disabled = true;
    DOM_EL.stop.disabled = true;
	
	DOM_EL.record.onclick = function() {
        mediaRecorder.start();
		var d = new Date();
        console.log('mediaRecorder.start() '+d.getTime())
	    interval = setInterval(loopRecorder, 301000);
        console.log("recorder started"); 
        DOM_EL.record.style.background = "red";
	    DOM_EL.messages.innerHTML = 'Recording ... Press stop to finish recording.'; 
        DOM_EL.stop.disabled = false;
        DOM_EL.record.disabled = true;
        acquireLock();
    }
	
	DOM_EL.stop.onclick = function() {
        onAppExit();
	    generateResults();
    } 
	
    DOM_EL.spinner.style.display = 'inline';
    DOM_EL.messages.innerHTML = 'Setting up audio';
  
    setupAudio().catch(err => {
	    serverLog({ERROR : err+' '+ navigator.userAgent});
    });
})

const acquireLock = async () => {
    try {
        wakeLock = await navigator.wakeLock.request('screen')
		console.log("screen lock started");
    } catch (err) {
        console.log(`${err.name}, ${err.message}`)
    }
}

const releaseLock = () => {
    if (wakeLock) {
        wakeLock.release().then(() => {
            wakeLock = null
		    console.log( 'screen lock disabled')
        })
    }
}

// recorder stops and and starts again every n seconds
function loopRecorder() {
	mediaRecorder.stop();
	mediaRecorder.start();	
    var d = new Date();
    console.log('mediaRecorder.start() '+d.getTime())	
}

function onAppExit() {
    DOM_EL.record.style.background = "";
    DOM_EL.record.style.color = "";
    DOM_EL.stop.disabled = true;
    DOM_EL.record.disabled = true;
	DOM_EL.spinner.style.display = 'none'

	if( interval ) clearInterval(interval);
	console.log("mediaRecorder loop stopped");
	recorderStopped = true;
	if( webWorker ) webWorker.terminate();
	console.log( 'webWorker terminated')
	if( mediaRecorder && mediaRecorder.state == "recording") mediaRecorder.stop();
	console.log("recorder stopped");
	
	releaseLock();	
}

function generateResults() {
    let Ty = 189
	let frameLength = 60
	var out = 'recording time:'+results.length/Ty+' s<br>';
    
	DOM_EL.messages.innerHTML = 'Results: Inference Time : '+inferenceTime+' s, ' + out ; 
	serverLog({Results : "Inference Time : "+inferenceTime+" s, " + out + "<br>" + navigator.userAgent});	
}	

const setupAudio = async function() {  
    // .getUserMedia triggers a dialogue to ask for permission
    navigator.mediaDevices.getUserMedia({ audio: true }).then(onPermissionSuccess, onPermissionError);
}

const onPermissionSuccess = async function(stream) {
    setupModel();
	try {
	    AudioContext = window.AudioContext || window.webkitAudioContext;
		audioContext = new AudioContext();
	    var data = [];
        mediaRecorder = new MediaRecorder(stream);
	    mediaRecorder.ondataavailable = function(e) {
            data.push(e.data);
        }
        mediaRecorder.onstop = function(e) {
            if (!recorderStopped) {
		        const blob = new Blob(data);
		        data = [];
		        convertToArrayBuffer(blob)
                    .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                     .then(processData);
		    }		 
        }	

        function convertToArrayBuffer(blob) {
            const url = URL.createObjectURL(blob);
            return fetch(url).then(response => {
                return response.arrayBuffer();
            });
        }

        function processData(audioBuffer) { 
            for(var i = 0, length = audioBuffer.getChannelData(0).length; i < length; i++){
	            recBuffers.push(audioBuffer.getChannelData(0)[i]); 
		    }	
		    console.log("audioBuffer Length:"+audioBuffer.getChannelData(0).length);	
            console.log("recBuffers Length:"+recBuffers.length);
			let endFrame =counter+4;
			DOM_EL.messages.innerHTML = 'Processing frames '+counter+' to '+endFrame+'. Recording next frame... Press stop to finish recording.'; 
            processFrame(); 		
        }			
    } catch(err) {
        onAppExit();
        console.log( 'The following error occured: ' + err);
		DOM_EL.messages.innerHTML = err;
		serverLog({ERROR : err+' '+ navigator.userAgent});
    }
};

let onPermissionError = function(err) {
  onAppExit();
  console.log( 'The following error occured: ' + err);
  DOM_EL.messages.innerHTML = 'Microphone permission denied. Please select the three dots in the upper-right corner of Chrome, then go to Settings > Site Settings > Microphone, toggle back on "Ask before accessing" and remove localhost from blocked sites. Then reload app and Click "Allow" when "localhost:3001 wants to use your microphone" popup message appears.'
  serverLog({ERROR : err+' '+ navigator.userAgent});
}

function serverLog(message) {
    try {
	        var xhr = new XMLHttpRequest();
		    xhr.open("POST", "https://192.168.2.4:3001");
            xhr.setRequestHeader("Accept", "application/json");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(message));
        } catch(err) {
            console.log(err);
		    DOM_EL.messages.innerHTML = 'ERROR CONNECTING TO SERVER: '+err; 
    }	
}


const offloadPredict = async function(data) {
  if (workerModelIsReady) {
	webWorker.postMessage(data);
  }
}

function processFrame() {
    if (recBuffers.length >= 48000*300) {
        const frame = recBuffers.splice(0, 48000*300);
		for(var i = 0, length = frame.length; i < length; i++){
            max = Math.max(max,frame[i]);
        }
        for(var i = 0, length = frame.length; i < length; i++){
            frame[i] = frame[i]/max;
        }
	    d = new Date();
	    startTime = d.getTime();
		let endCounter = counter+4;
		console.log("start prediction for frames: "+counter+ ' to '+endCounter);
        counter = counter + 5;
		offloadPredict(frame);
	}
}

const setupModel = async function() {
  if (window.Worker) {
	DOM_EL.messages.innerHTML = 'Loading sound event detection model ...';  
    webWorker = new Worker('tf-worker.js');
    webWorker.onmessage = evt => {
      if (evt.data.modelIsReady) {
        workerModelIsReady = true;
		DOM_EL.record.disabled = false;
		DOM_EL.spinner.style.display = 'none'
		DOM_EL.messages.innerHTML = 'Sound event detection model ready. Press record to start recording...'; 
      } 
	  else if (evt.data.errorInTfWorker) {
        onAppExit();
		console.log( 'webWorker terminated abnormally')
		DOM_EL.messages.innerHTML = 'ERROR IN TF WORKER: ' + evt.data.errorInTfWorker; 
		serverLog({ERROR : evt.data.errorInTfWorker+' '+ navigator.userAgent});
      }
      else {
		  if (JSON.parse(evt.data).length ==189*5){
			  results.push(...JSON.parse(evt.data)); 
		      console.log("end prediction");
			  d = new Date();
			  inferenceTime = Math.ceil(0.2*(d.getTime()-startTime)/1000);
			  DOM_EL.messages.innerHTML = counter +' frames processed.Inference time: '+inferenceTime+ ' s. Recording next frame... Press stop to finish recording.'; 
          }
          else {
              console.log(JSON.parse(evt.data));
          }			  
      } 		  
    };
  } else {
        onAppExit();
		console.log( 'webWorker not supported')
		DOM_EL.messages.innerHTML = 'webWorker feature not supported by browser'; 
		serverLog({ERROR : 'webWorker feature not supported by browser '+ navigator.userAgent});
  }
}
