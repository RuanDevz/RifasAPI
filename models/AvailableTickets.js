// models/availableTickets.js

module.exports = (sequelize, DataTypes) => {
  const AvailableTickets = sequelize.define('AvailableTickets', {
    tickets: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  });

  return AvailableTickets;
};
