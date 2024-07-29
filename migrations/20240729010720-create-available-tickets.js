'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('AvailableTickets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      tickets: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

   
    await queryInterface.bulkInsert('AvailableTickets', [{
      tickets: 20000,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('AvailableTickets');
  }
};
