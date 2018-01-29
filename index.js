const mqtt = require('mqtt');
const config = require('@loke/config');
const client = require('prom-client');

const gauge = new client.Gauge({
  name: 'sensor',
  help: 'Sensor data',
  labelNames: ['sensorType', 'sensorValue', 'sensorId']
});
gauge.set({ sensorType: 'temperature', sensorValue: 100, sensorId: '111' }, 10);

// collectDefaultMetrics({ register });

let mqttClient;
let mqttConnected = false;

const mqttUri = 'mqtt://' + config.get('mqtt.host');
const sensors = config.get('sensors');
const topics = sensors.map(s => s.topic);
const sensorMap = sensors.reduce((o, sensor) => {
  o[topic] = sensor;
  return o;
}, {});

mqttClient  = mqtt.connect(mqttUri);

mqttClient.on('message', (topic, message) => {
  const strMsg = message.toString();
  const data = strMsg ? JSON.parse(strMsg) : undefined;

  const sensor = sensorMap[topic];
  value = data[sensor.field];
  gauge.set({ sensorType: sensor.type, sensorId: sensor.id }, value);
});

mqttClient.on('connect', () => {
  logger.info('MQTT connected');
  mqttConnected = true;

  topics.forEach(topic => {
    mqttClient.subscribe(topic);
  });
});

mqttClient.on('close', console.log);
mqttClient.on('offline', console.log);
mqttClient.on('error', console.error);
