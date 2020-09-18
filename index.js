const mqtt = require('mqtt');
const config = require('@loke/config').create('mqtt-sensor-exporter');
const client = require('prom-client');
const express = require('express');

const handler = {
  get: function(target, name) {
    if (!(name in target)) {
      if (name === 'motion') {
        target[name] = createCounter(name);
      } else {
        target[name] = createGauge(name);
      }
    }
    return target[name];
  }
};
const gauges = new Proxy({}, handler);

function createCounter(name) {
  const counter = new client.Counter({
    name: `sensor_${name}`,
    help: `Sensor data for ${name}`,
    labelNames: ['sensorId']
  });
  return (sensorId) => {
    counter.inc({ sensorId });
  };
}

function createGauge(name) {
  const gauge = new client.Gauge({
    name: `sensor_${name}`,
    help: `Sensor data for ${name}`,
    labelNames: ['sensorId']
  });
  return (sensorId, value) => {
    gauge.set({ sensorId }, value);
  }
}

let mqttClient;

const mqttUri = 'mqtt://' + config.get('mqtt.host');
const sensors = config.get('sensors');
const topics = sensors.map(s => s.topic);
const sensorMap = sensors.reduce((o, sensor) => {
  o[sensor.topic] = sensor;
  return o;
}, {});

mqttClient  = mqtt.connect(mqttUri);

mqttClient.on('message', (topic, message) => {
    const strMsg = message.toString();
    const data = strMsg ? JSON.parse(strMsg) : undefined;
    sensor = sensorMap[topic];

    // make topic path a metric (heatpump)
    if(!sensor && !topic.startsWith("zigbee2mqtt")) {
        const gaugeName = topic.replace(/\//g, '_').toLowerCase();
        gauges[gaugeName](gaugeName, data);
        return;
    }

    // take last topic part and create metric for it (zigbee2mqtt)
    if(topic.startsWith("zigbee2mqtt")) {
        startingSlash = topic.indexOf("/");
        sensorName = topic.substring(startingSlash+1, topic.length);
        sensor = sensorMap['zigbee2mqtt/+'];
        sensor.id = sensorName;
    }

  // extract fields
  if(Array.isArray(sensor.field)) {
    sensor.field.forEach(function(fieldName) {
        value = parseFloat(data[fieldName]);
        if(value !== undefined && !isNaN(value)) {
            gauges[sensor.type+"_"+fieldName](sensor.id, value);
        }
    })
  }
  else {
    value = sensor.field && data[sensor.field] || data;
    gauges[sensor.type](sensor.id, value);
  }
});

mqttClient.on('connect', () => {
  console.info('MQTT connected');

  topics.forEach(topic => {
    mqttClient.subscribe(topic);
  });
});

mqttClient.on('close', console.log);
mqttClient.on('offline', console.log);
mqttClient.on('error', console.error);

const port = config.get('http.port');
const app = express()
  .get('/metrics', (req, res) => res.send(client.register.metrics()))
  .listen(port);
