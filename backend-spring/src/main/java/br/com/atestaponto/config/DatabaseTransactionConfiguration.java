package br.com.atestaponto.config;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.TransactionDefinition;

@Configuration
public class DatabaseTransactionConfiguration {

    @Bean
    public JdbcTransactionManager transactionManager(DataSource dataSource) {
        return new JdbcTransactionManager(dataSource) {
            @Override
            protected void prepareTransactionalConnection(Connection connection,
                    TransactionDefinition definition) throws SQLException {
                // O pool continua read-only por padrao; somente transacoes de escrita liberam a conexao.
                connection.setReadOnly(definition.isReadOnly());
                super.prepareTransactionalConnection(connection, definition);
            }
        };
    }
}
