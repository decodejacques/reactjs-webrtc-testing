import React, { Component } from 'react';
import './App.css';
import firebase from 'firebase';
import 'webrtc-adapter';
import smb from './smb_stage_clear.wav'
var remoteSet = false;
var iceBacklog = [];

// Initialize Firebase
var config = {
  apiKey: "AIzaSyDRy6Lly4AErHidcC2qxnz1YvrHDAhxkrY",
  authDomain: "reactjs-firebase-test.firebaseapp.com",
  databaseURL: "https://reactjs-firebase-test.firebaseio.com",
  projectId: "reactjs-firebase-test",
  storageBucket: "reactjs-firebase-test.appspot.com",
  messagingSenderId: "2050598484"
};
firebase.initializeApp(config);

var database = firebase.database();



function searchCandidates(data2) {
  var candidate = null;
  var data = data2.val();
  for (var x in data) {
    candidate = { key: x, data: data[x] }
    break;
  }
  if (!candidate) {
    waitingList();
  } else {
    initiate(candidate);
  }
}


function send(ref, msg) {
  var msgs = ref.push();
  msgs.set(msg);
}



function initiate(candidate) {
  console.log("initiating");
  id = candidate.data.id;
  // found someone. Let's start the game!
  waiterRef = database.ref('play/' + id + '/forWaiter');
  // this.p1ref.onDisconnect().remove();

  initializerRef = database.ref('play/' + id + '/forInitializer');
  initializerRef.onDisconnect().remove();
  initializerRef.on("child_added", (data) => { receiveInitializer(data.val()); });

  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  }).then(stream => {
    localVideo.srcObject = stream
    localStream = stream;

    pc1 = new RTCPeerConnection(ice);
    pc1.onaddstream = evt => {
      window.remoteStream = remoteVideo.srcObject = evt.stream;
    }

    pc1.onicecandidate = evt => {
      if (evt.candidate) {
        var message = { // Sent by socket.io
          label: evt.candidate.sdpMLineIndex,
          candidate: evt.candidate.candidate
        };
        var c = new RTCIceCandidate({ // Received by socket.io
          sdpMLineIndex: message.label,
          candidate: message.candidate
        });

        send(waiterRef, { type: 'ice-candidate', payload: JSON.stringify(c) })
        //pc2.addIceCandidate(new RTCIceCandidate(c))
      }
    };

    pc1.addStream(localStream);
    pc1.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    }).then(desc => {
      console.log('sending offer');
      pc1.setLocalDescription(desc);
      send(waiterRef, { type: 'desc', payload: JSON.stringify(desc) })
    })
  })


  //this.initGame();



  send(waiterRef, { foo: '5' })
}

function receiveInitializer(x) {
  console.log(x);
  if (x.type === 'answer') {
    console.log('got answer');
    pc1.setRemoteDescription(JSON.parse(x.payload))
      .then(() => {
        iceBacklog.forEach(x => pc1.addIceCandidate(new RTCIceCandidate(x)));
        remoteSet = true
      })
  } else if (x.type === 'ice-candidate') {
    if (remoteSet) pc1.addIceCandidate(new RTCIceCandidate(JSON.parse(x.payload)));
    else iceBacklog.push(JSON.parse(x.payload));
  }
}

var ice = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };

var id = Math.floor(Math.random() * 1000);
var gotFirstMessage = false
var waiterRef = null;
var initializerRef = null;

var waitingList = () => {
  // no one is here, let's signal our waiting
  var r = database.ref('waiting').push();
  r.onDisconnect().remove();
  r.set({ id: id });
  database.ref('play/' + id).onDisconnect().remove();
  var waiterRef = database.ref('play/' + id + '/forWaiter');
  waiterRef.onDisconnect().remove();
  waiterRef.on("child_added", (data) => receiveWaiter(r, data.val()));
}

var receiveWaiter = (r, d) => {
  console.log('waiter received a message');
  if (!gotFirstMessage) {
    gotFirstMessage = true;
    r.remove();
    r.off();
    initializerRef = database.ref('play/' + id + '/forInitializer');
  }
  if (d.type === 'desc') {
    console.log('received description');
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true
    }).then(stream => {
      localVideo.srcObject = stream
      localStream = stream;

      pc2 = new RTCPeerConnection(ice);
      pc2.onaddstream = evt => {
        console.log("remote stream added");
        window.remoteStream = remoteVideo.srcObject = evt.stream;
      }
      pc2.addStream(localStream);

      pc2.onicecandidate = evt => {
        if (evt.candidate) {
          var message = { // Sent by socket.io
            label: evt.candidate.sdpMLineIndex,
            candidate: evt.candidate.candidate
          };
          var c = new RTCIceCandidate({ // Received by socket.io
            sdpMLineIndex: message.label,
            candidate: message.candidate
          });
          send(initializerRef, { type: 'ice-candidate', payload: JSON.stringify(c) })
          //pc2.addIceCandidate(new RTCIceCandidate(c))
        }
      };
      pc2.setRemoteDescription(new RTCSessionDescription(JSON.parse(d.payload))) // needs socket.io
        .then(() => pc2.createAnswer())
        .then(answer => {
          remoteSet = true;
          iceBacklog.forEach(x => pc2.addIceCandidate(new RTCIceCandidate(x)));
          pc2.setLocalDescription(answer);
          console.log("sending answer");
          send(initializerRef, { type: 'answer', payload: JSON.stringify(answer) });
        })

    })

  } else if (d.type === 'ice-candidate') {
    if (remoteSet) {
      pc2.addIceCandidate(new RTCIceCandidate(JSON.parse(d.payload)));
    } else {
      iceBacklog.push(JSON.parse(d.payload));
    }
  } else {
    console.log(d);
  }
  //  this.receive(d);
}

var localVideo;
var remoteVideo;

var localStream = null;
var pc1 = null;
var pc2 = null;



class App extends Component {
  componentDidMount() {
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    database.ref('waiting').once('value').then(searchCandidates);
    new Audio(smb).play();
//     setTimeout(() => new Audio(smb).play(), 1000);
  }
  render() {
    return (
      <div>
        <video id="localVideo" autoPlay ></video>
        <video id="remoteVideo" autoPlay ></video>
      </div>
    );
  }
}

export default App;
