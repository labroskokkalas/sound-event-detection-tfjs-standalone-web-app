let model;

const setup = async function() {
    importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.6.0/dist/tf.min.js");
    tf.enableProdMode();
    //tf.setBackend("webgl").catch(console.warn);

    const MODEL_URL = 'https://192.168.2.4:3001/model/model.json';
    model = await tf.loadLayersModel(MODEL_URL);
	
	// warm-up the model
	const zeros = tf.zeros([1,1607,51]);
	var d = new Date();
    let startTime = d.getTime();
    model.predict(zeros);
	d = new Date();
	let inferenceTime = d.getTime()-startTime;
	if (inferenceTime < 50000) {
        // inform the main page that our model is loaded
        postMessage({ modelIsReady: true});
    } else {
	    // inform the main page that there is not enough processing power 
		postMessage({ errorInTfWorker: "There might not be enough processing power to run apnea app. Please close all apps and try again or use another device if error persists"});	
	}	
} 

setup().catch(err =>{
    console.error("Can't load model: ", err)
	postMessage({ errorInTfWorker: err});
});

onmessage = evt => {
    predict(evt.data).catch(err => {
	    console.error("inside webworker error: ",err)
	    postMessage({ errorInTfWorker: err});
    })
}

const predict = async function(jsonData) {
    console.log('START INFERENCE');
	const scores = tf.tidy(() => {
	    for(var i = 0; i < 5; i++){
		    let tf1d = tf.tensor(jsonData.slice(48000*60*i,48000*60*(i+1)));
	        //logspectrogram code here
            let amin = tf.tensor(1e-16)
            let top_db = tf.tensor(80.0)
	        let spectrograms = tf.signal.stft(tf1d,2048,1792)
    	    tf1d.dispose();
	        let magnitude_spectrograms = tf.abs(spectrograms)
	        spectrograms.dispose();
	        let ref_value = tf.max(magnitude_spectrograms)
            let log_spec = tf.mul(10.0,tf.div(tf.log(tf.maximum(amin, magnitude_spectrograms)),tf.log(10.)))
		    log_spec = tf.sub(log_spec,tf.mul(10.0,tf.div(tf.log(tf.maximum(amin, ref_value)),tf.log(10.))))
		    let log_spectrograms = tf.maximum(log_spec, tf.sub(tf.max(log_spec),top_db))
		    log_spec.dispose();
		    log_spectrograms = log_spectrograms.expandDims()
		    //keep 51 frequencies from 400 Hz to 4kHz
		    log_spectrograms = tf.slice(log_spectrograms,[0,0,17],[-1,-1,153])
		    const indices = tf.tensor1d([1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58,61,64,67,70,73,76,79,82,85,88,91,94,97,100,103,106,109,112,115,118,121,124,127,130,133,136,139,142,145,148,151], 'int32');
		    log_spectrograms = tf.gather (log_spectrograms, indices, -1)
		    log_spectrograms = tf.reverse(log_spectrograms,1)
		    //logspectrogram code here
		    //console.log( tf.memory() );
		    //Perform the detection with your layer model:
			if (i == 0) {
			    var modelReturn = model.predict(log_spectrograms);
			} else {
                 modelReturn = modelReturn.concat(model.predict(log_spectrograms));   
				 //postMessage(JSON.stringify({'xx':modelReturn.toString()}));
            } 
        }			
        return modelReturn;
	})
    if (scores) {
	    const probabilities = await scores.data();
        scores.dispose();
        const result = Array.from(probabilities);
	    console.log('END INFERENCE');
	    postMessage(JSON.stringify(result));
    } else {
        postMessage({ errorInTfWorker: "Unknown error in tf worker"});
    }
}