'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TimeLeft extends Model {
    static associate(models) {
      
    }
  }
  TimeLeft.init({
    timeLeft: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'TimeLeft',
  });
  return TimeLeft;
};
