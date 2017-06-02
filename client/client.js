// TODO : http://stackoverflow.com/questions/38240504/refresh-expired-jwt-in-browser-when-using-google-sign-in-for-websites
// OR   : http://stackoverflow.com/questions/32150845/how-to-refresh-expired-google-sign-in-logins?rq=1
// READ : http://stackoverflow.com/questions/3105296/if-rest-applications-are-supposed-to-be-stateless-how-do-you-manage-sessions
// READ : http://www.cloudidentity.com/blog/2014/03/03/principles-of-token-validation/

// this statement is a redirect for brackets development
if (window.location.hostname === '127.0.0.1') {
    window.location = 'http://localhost:1898';
}

// prepend the url of node.js server
function route(url) {
    return 'http://localhost:3000' + url;
}

var profile; // google user profile
var authResponse; // google user auth response

function onSignIn(googleUser) {
    profile = googleUser.getBasicProfile();
    authResponse = googleUser.getAuthResponse();

    var login = {
        id: profile.getId(),
        name: profile.getName(),
        givenName: profile.getGivenName(),
        familyName: profile.getFamilyName(),
        imageUrl: profile.getImageUrl(),
        email: profile.getEmail(),
        hostedDomain: googleUser.getHostedDomain()
    };

    http.post('/a/login', login);
    
    http.get('/a/tasks', function(data, statusText, jqXHR) {
        if(jqXHR.status === 200) {
            data.forEach(function(obj) {
                $('#todo-list').append('<div data-id="' + obj._id + '" contenteditable="true" class="dc well well-lg col-md-12">' + obj.text + '<span class="glyphicon glyphicon-trash"></span></div>');    
            });
        } else {
            alert('no milk :(');
        }
    }, function(jqXHR, textStatus, errorThrown) {
        alert('error');
    });
    
    $('.g-signin2').hide();
    $('#g-signout').show();
    $('#app').show();
}

function signOut() {
    gapi.auth2.getAuthInstance().signOut();
    $('.g-signin2').show();
    $('#g-signout').hide();
    $('#app').hide();
    $('#todo-list').html('');
}

function disconnect() {
    gapi.auth2.getAuthInstance().disconnect();
    $('.g-signin2').show();
    $('#g-signout').hide();
    $('#app').hide();
    $('#todo-list').html('');
}

var http = {};

http.post = function(url, json, success, error) {
    $.ajax({
        url: route(url),
        method: 'POST',
        data: json,
        headers: {
            'Authorization': authResponse.id_token
        },
        success: function(data, statusText, jqXHR) {
            if (success) success(data, statusText, jqXHR);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if (error) error(jqXHR, textStatus, errorThrown);
        }
    });
};

http.get = function(url, success, error) {
    $.ajax({
        url: route(url),
        method: 'GET',
        headers: {
            'Authorization': authResponse.id_token
        },
        success: function(data, statusText, jqXHR) {
            if (success) success(data, statusText, jqXHR);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if (error) error(jqXHR, textStatus, errorThrown);
        }
    });
};

http.put = function(url, json, success, error) {
    $.ajax({
        url: route(url),
        method: 'PUT',
        data: json,
        headers: {
            'Authorization': authResponse.id_token
        },
        success: function(data, statusText, jqXHR) {
            if (success) success(data, statusText, jqXHR);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if (error) error(jqXHR, textStatus, errorThrown);
        }
    });
};

http.delete = function(url, success, error) {
    $.ajax({
        url: route(url),
        method: 'DELETE',
        headers: {
            'Authorization': authResponse.id_token
        },
        success: function(data, statusText, jqXHR) {
            if (success) success(data, statusText, jqXHR);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if (error) error(jqXHR, textStatus, errorThrown);
        }
    });
};

$('#new-task').keypress(function(e) {
    if (e.which == 13) { // the enter key
        e.preventDefault();
        
        var payload = { text: $(this).text() };
        
        http.post('/a/task', payload, function(data, statusText, jqXHR) {
            if (jqXHR.status === 201) {
                $('#todo-list').append('<div data-id="' + data.insertedIds[0] + '" contenteditable="true" class="dc well well-lg col-md-12">' + data.ops[0].text + '<span class="glyphicon glyphicon-trash"></span></div>');
                $('#new-task').html('');
            } else {
                alert('error :S');
            }
        });
    }
});

$('#app').on('keypress', '.dc', function(e) {
    if (e.which == 13) { // the enter key
        e.preventDefault();
        
        var taskElement = $(this);
        var data = { text: taskElement.text() };
        var taskId = taskElement.data('id');
        
        http.put('/a/task/' + taskId, data, function(data, statusText, jqXHR) {
            if(jqXHR.status === 200) {
                taskElement.blur();
            }
        });
    }
});

$('#app').on('click', '.well .glyphicon-trash', function() {
    var taskElement = $(this).parent();
    var taskId = taskElement.data('id');
    
    http.delete('/a/task/' + taskId, function(data, statusText, jqXHR) {
        if(jqXHR.status === 200) {
            taskElement.remove();
        }
    });
});


var socketServer = 'http://localhost:3000';
var socket = io.connect(socketServer);

socket.on('connect', function() {
    console.log('socket connected');
});