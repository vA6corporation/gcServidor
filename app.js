const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const ip = '192.168.1.201';

app.use(express.static('public'));
app.set('view engine', 'pug');

var equipments = {};
var timeouts = [];

app.locals.ip = ip;
app.enable('view cache'); //habilitar solo en fase de produccion
app.locals.baseUrl = location => `http://${ip}:7766/${location}`;
app.locals.formatAMPM = function(timeStamp) {
  var date = new Date(timeStamp);
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? '0'+minutes : minutes;
  var strTime = hours + ' : ' + minutes + ' ' + ampm;
  return strTime;
}

app.locals.formatTiempo = function(tiempo) {
  var horas = 0, minutos = 0;
  while (tiempo >= 60000) {
    if (tiempo >= 60000) {minutos++; tiempo -= 60000;}
    if (minutos >= 60) {horas++; minutos -= 60;}
  }
    return horas+':'+minutos
}

app.locals.formatExtras = function(extras) {
  var soles = 0, centimos = 0;
  while (extras >= 1) {
    if (extras >= 1) {centimos++; extras -= 1;}
    if (centimos >= 10) {soles++; centimos -= 10;}
  }
  return soles+'.'+centimos;
}

app.get('/blockScreen', function(req, res){
  res.render('blockScreen',{client: equipments[req.query.id], id: req.query.id});
});

app.get('/reloj', function(req, res){
  res.render('reloj', {tiempo: equipments[req.query.id], id: req.query.id});
});

app.get('/control', function(req, res){
  res.render('control', {equipments: equipments});
});

io.on('connection', function(socket) {

  function emit(id, action){
    if (equipments[id] && equipments[id].estado && io.sockets.connected[equipments[id].socket]) {
      io.sockets.connected[equipments[id].socket].emit(action);
    }
  }

  function updateControl(){
    //io.to('controles').emit('actualizar', {tbody:tbody({lista: equipments, ip: ip}), lista:equipments})
    io.to('controles').emit('actualizar', {equipments: equipments});
  }

  function integrar(id) {
    if(equipments[id].tiempo) {
      console.log('Usuario reintegrado(tiempo establecido): '+id)
      const cTime = new Date().getTime()
      const time = equipments[id].inicio + equipments[id].tiempo
      if (cTime < time) {
        console.log('Usuario dentro del tiempo(cTime: '+cTime+' tiempo: '+time+')')
        emit(id, 'activar')
      } else {
        console.log('Usuario fuera del tiempo(cTime: '+cTime+' tiempo: '+time+')')
        emit(id, 'desactivar')
      }
    } else if(equipments[id].inicio){
      console.log('Usuario reintegrado(libre): '+id);
      emit(id, 'activar')
    } else {
      console.log('Usuario reintegrado(sin iniciar): '+id);
      emit(id, 'desactivar')
    }
    console.log(equipments);
  }

  socket.on('add-user', function(data){
    if (!equipments[data.username]){
      console.log('usuario agregado: '+data.username);
      equipments[data.username] = {
        'socket': socket.id,
        'inicio': null,
        'tiempo': null,
        'extras': null,
        'estado': true
      };
    } else {
      console.log('usuario reintegrado: '+data.username);
      equipments[data.username].socket = socket.id;
      equipments[data.username].estado = true;
    }
    integrar(data.username)
    updateControl()
  });

  socket.on('add-control', function(data){
    console.log('control agregado')
    socket.join('controles')
  });

  socket.on('add-reloj', function(data){
    console.log('reloj agregado')
    socket.join('relojes')
  });

  socket.on('activar', function(data){
    console.log("Controlando: " + data.username)
    var timeStamp = new Date().getTime()
    equipments[data.username].inicio = timeStamp
    emit(data.username, 'activar')
    updateControl();
  });

  socket.on('desactivar', function(data){
    console.log("Desactivando: " + data.username);
    emit(data.username, 'desactivar')
    updateControl();
  });

  socket.on('cobrar', function(data){
    equipments[data.username].inicio = null;
    equipments[data.username].tiempo = null;
    equipments[data.username].extras = null;
    console.log("Cobrando: " + data.username);
    if (equipments[data.username].estado) {
      emit(data.username, 'desactivar')
    } else {
      delete equipments[data.username];
    }
    updateControl();
  });

  socket.on('establecerTiempo', function(data){
    console.log('Estableciendo tiempo: '+data.username);
    equipments[data.username].tiempo = data.tiempo;
    //fucion Establecer tiempo
    var cTime = new Date().getTime();
    var timeout = data.tiempo - (cTime - equipments[data.username].inicio)
    console.log("Fijando tiempo: " + data.username);
    console.log(equipments)
    integrar(data.username)
    clearTimeout(timeouts[data.username]);
    timeouts[data.username] = setTimeout(function(){
      console.log('cortamos uso: '+data.username)
      emit(data.username, 'desactivar')
    }, timeout)
    updateControl();
    io.to('relojes').emit('actualizar');
  });

  socket.on('dejarLibre', function(data){
    console.log('dejando Libre');
    equipments[data.username].tiempo = null
    integrar(data.username)
    io.to('relojes').emit('actualizar');
    updateControl();
  });

  socket.on('establecerExtras', function(data){
    console.log('Estableciendo extras: '+data.username);
    equipments[data.username].extras = data.extras;
    console.log(equipments);
    updateControl();
  });

  socket.on('vaciarExtras', function(data){
    console.log('vaciando extras: '+data.username);
    equipments[data.username].extras = null;
    console.log(equipments);
    updateControl();
  });

  socket.on('regalarTiempo', function(data) {
    var cTime = new Date().getTime()
    var tTranscurrido = cTime - equipments[data.username].inicio
    var timeout = (equipments[data.username].tiempo + 300000) - tTranscurrido
    console.log("Fijando tiempo: " + data.username)
    emit(data.username, 'activar')
    clearTimeout(timeouts[data.username])
    timeouts[data.username] = setTimeout(function() {
      emit(data.username, 'desactivar')
    }, timeout)
  });

  socket.on('cambiarPC', function(data) {
    console.log('cambiado datos de ('+data.drag+':'+equipments[data.drag].socket+') hacia: ('+data.drop+':'+equipments[data.drop].socket+')');
    clearTimeout(timeouts[data.drag]);
    clearTimeout(timeouts[data.drop]);
    var estadoDrag = equipments[data.drag].estado
    var estadoDrop = equipments[data.drop].estado
    var socketDrag = equipments[data.drag].socket
    var socketDrop = equipments[data.drop].socket
    var tmpClient = equipments[data.drag];
    equipments[data.drag] = equipments[data.drop];
    equipments[data.drop] = tmpClient;
    equipments[data.drag].socket = socketDrag
    equipments[data.drop].socket = socketDrop
    equipments[data.drag].estado = estadoDrag
    equipments[data.drop].estado = estadoDrop
    console.log(equipments);
    if (equipments[data.drag].estado) {
      integrar(data.drag)
    } else {
      delete equipments[data.drag];
    }
    if (equipments[data.drop].estado) {
      integrar(data.drop)
    } else {
      delete equipments[data.drop];
    }
    updateControl()
  });

  socket.on('apagar', function(data){
    console.log("apagando: " + data.username);
    emit(data.username, 'apagar')
    delete equipments[data.username];
    console.log(equipments)
    updateControl();
  });

  socket.on('disconnect', function(){
    for (var key in equipments) {
      if (equipments[key].socket == socket.id) {
        if (!equipments[key].inicio) {
          console.log("Desconectando PC: "+ key);
          delete equipments[key];
        } else {
          equipments[key].estado = false
          console.log('Usuario fuera de linea: '+key);
        }
        updateControl();
      }
    }
  });
});

server.listen(7766, function() {
  console.log(`Servidor corriendo en http://${ip}:7766`);
});
