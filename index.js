'use strict';

let Bot = require('./Bot');
const redis = require('redis');

const client = redis.createClient();

const bot = new Bot({
    token: process.env.SLACK_TOKEN,
    autoReconnect: true,
    autoMark: true
});

bot.respondTo('hello', (message, channel, user) => {
    bot.send(`Hello to you too, ${user.name}!`, channel)
}, true);

bot.respondTo('roll', (message, channel, user) => {
    const members = bot.getMembersByChannel(channel);

    if (!members) {
        bot.send('You have to challenge someone in a channel, not a direct message!', channel);
        return;
    }

    let args = getArgs(message.text);

    if (args.length < 1) {
        bot.send('You have to provide the name of the person you wish to challenge!', channel);
        return;
    }

    /*  if (members.indexOf(args[0]) < 0) {
          bot.send(`Sorry ${user.name}, but I either can't find ${args[0]} in this channel, or they are a bot!`, channel);
          return;
      }*/

    if (args.indexOf(user.name) > -1) {
        bot.send(`Challenging yourself is probably not the best use of your or my time, ${user.name}`, channel);
        return;
    }

    let firstRoll = Math.round(Math.random() * 100);
    let secondRoll = Math.round(Math.random() * 100);

    let challenger = user.name;
    let opponent = args[0];

    while (firstRoll === secondRoll) {
        secondRoll = Math.round(Math.random() * 100);
    }

    let winner = firstRoll > secondRoll ? challenger : opponent;

    client.zincrby('rollscores', 1, winner);

    bot.send(
        `${challenger} fancies their chances against ${opponent}!\n
        ${challenger} rolls: ${firstRoll}\n
        ${opponent} rolls: ${secondRoll}\n\n
        *${winner} is the winner!*`, channel);
}, true);

bot.respondTo('scoreboard', (message, channel) => {
    let args = getArgs(message.text);

    if (args[0] === 'wipe') {
        client.del('rollscores');
        bot.send('The scoreboard has been wiped!', channel);
        return;
    }

    client.zrevrange('rollscores', 0, -1, 'withscores', (err, set) => {
        if (err) {
            bot.send('Oops, something went wrong! Please try again later', channel);
            return;
        }

        if (set.length < 1) {
            bot.send('No scores yet! Challenge each other with the \`roll\` command!', channel);
            return;
        }
        let scores = [];

        for (let i = 0; i < set.length; i++) {
            scores.push([set[i], set[i + 1]]);
            i++;
        }

        bot.send('The current scoreboard is:', channel);
        scores.forEach((score, index) => {
            bot.send(`${index + 1}. ${score[0]} with ${score[1]} points.`, channel);
        });
    });
}, true);


bot.respondTo('todo', (message, channel, user) => {
    let args = getArgs(message.text);

    switch (args[0]) {
        case 'add':
            addTask(user.name, args.slice(1).join(' '), channel);
            break;
        case 'complete':
            completeTask(user.name, parseInt(args[1], 10), channel);
            break;
        case 'delete':
            removeTaskOrTodoList(user.name, args[1], channel);
            break;
        case 'help':
            bot.send('Create task with \`todo add [TASK]\`, complete them with \`todo complete [TASK_NUMBER]\` and remove them with \`todo delete [TASK_NUMBER]\` or \`todo delete all\`', channel);
            break;
        default:
            showTodos(user.name, channel);
            break;
    }
}, true);

function addTask(name, task, channel) {
    if (task === '') {
        bot.send('Usage: \`todo add [TASK]\`', channel);
        return;
    }
    let key = name + "SET";
    client.sadd(key, task);

    bot.send('You added a task!', channel);
    showTodos(name, channel);
}

function completeTask(name, taskNum, channel) {
    if (Number, isNaN(taskNum)) {
        bot.send('Usage: \`todo complete [TASK_NUMBER]\`', channel);
        return;
    }

    let key = name + "SET";
    client.smembers(key, (err, set) => {
        if (err || (set.length < 1)) {
            bot.send(`You don\'t have any task listedyet, ${user.name}!`, channel);
            return;
        }

        if (taskNum > set.length || (taskNum <= 0)) {
            bot.send('Oops, that task doesn\'t exist!', channel);
            return;
        }

        let task = set[taskNum - 1];

        if (/~/i.test(task)) {
            bot.send('That task has already been completed!');
            return;
        }

        client.srem(key, task);
        client.sadd(key, `~${task}~`);

        bot.send('You completed a task', channel);
        showTodos(name, channel);
    });
}

function removeTaskOrTodoList(name, target, channel) {
    let key = name + "SET";
    if (typeof target === 'string' && (target === 'all')) {
        client.del(key);
        bot.send('To-do list cleared', channel);
        return;
    }

    let taskNum = parseInt(target, 10);

    if (Number.isNaN(taskNum)) {
        bot.send('Usage: \`todo delete [TASK_NUMBER]\` or \`todo delete all`', channel);
        return;
    }

    client.smembers(key, (err, set) => {
        if (err || set.length < 1) {
            bot.send(`You don\'t have any tasks to delete. ${name}!`);
            return;
        }

        if (taskNum > set.length || taskNum <= 0) {
            bot.send('Oops, that task doesn\'t exist!');
            return;
        }

        client.srem(key, set[taskNum - 1]);
        bot.send('You deleted a task!', channel);
        showTodos(name, channel);
    });
}

function showTodos(name, channel) {

    let key = name + "SET";
    client.smembers(key, (err, set) => {
        if (err || (set.length < 1)) {
            bot.send(`You don\´t have any task listed yet, ${name}!`, channel);
            return;
        }
        bot.send(`${name}'s to-do list:`, channel);

        set.forEach((task, index) => {
            bot.send(`${index + 1}. ${task}`, channel);
        });
    });
}

function getArgs(msg) {
    return msg.split(' ').slice(1);
}