'use strict';

const cards = require('./cards');
const rules = require('./rules');
const payouts = require('./payouts');

module.exports = {
  ...cards,
  ...rules,
  ...payouts
};
