const mqtt = require('mqtt');
const config = require('@loke/config').create('mqtt-sensor-exporter');
const client = require('prom-client');
const express = require('express');

const handler = {
  get: function(target, name) {
    if (!(name in target)) {
      if (name === 'motion') {
        target[name] = new client.Counter({
          name: `sensor_${name}`,
          help: `Sensor data for ${name}`,
          labelNames: ['sensorId']
        });
      } else {
        target[name] = new client.Gauge({
          name: `sensor_${name}`,
          help: `Sensor data for ${name}`,
          labelNames: ['sensorId']
        });
      }
    }
    return target[name];
  }
};
const gauges = new Proxy({}, handler);

const gauge = new client.Gauge({
  name: 'sensor',
  help: 'Sensor data',
  labelNames: ['sensorType', 'sensorId']
});

let mqttClient;
let mqttConnected = false;

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

  const sensor = sensorMap[topic];
  value = sensor.field && data[sensor.field] || data;
  gauge.set({ sensorType: sensor.type, sensorId: sensor.id }, value);
  const sensorGauge = gauges[sensor.type];
  if (sensorGauge.set) {
    gauges[sensor.type].set({ sensorId: sensor.id }, value);
  } else {
    sensorGauge.inc();
  }
  // console.log(client.register.metrics());
});

mqttClient.on('connect', () => {
  console.info('MQTT connected');
  mqttConnected = true;

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
