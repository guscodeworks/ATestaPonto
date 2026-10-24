package br.com.atestaponto.publicpunch.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Teste unitario: QR e so atalho; paginas de login abrem com ou sem token, sem Redis. */
class EmployeePagesControllerTest {
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new EmployeePagesController()).build();

    private void opensLogin(String url) throws Exception {
        mvc.perform(get(url)).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }

    @Test
    void directAccessOpensLogin() throws Exception {
        opensLogin("/");
        opensLogin("/login");
        opensLogin("/ponto/acessar");
    }

    @Test
    void qrAccessOpensLoginWhateverTheToken() throws Exception {
        opensLogin("/ponto/acessar?qr=" + "A".repeat(43));
        opensLogin("/ponto/acessar?qr=invalido");
        opensLogin("/ponto/acessar?qr=a&qr=b");
        opensLogin("/login?qr=invalido");
    }
}
