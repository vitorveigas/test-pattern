import { Item } from '../src/domain/Item.js';
import { CheckoutService } from '../src/services/CheckoutService.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';
import { UserMother } from './builders/UserMother.js';

const cartaoFicticio = 'cartao-de-teste';
const idPedidoSalvo = 42;

function criarStubDeRepositorio() {
    return {
        salvar: jest.fn(async (pedido) => ({ ...pedido, id: idPedidoSalvo })),
    };
}

describe('CheckoutService', () => {
    describe('quando o pagamento falha', () => {
        test('retorna null quando o gateway recusa o pagamento', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            const repositorioDummy = {};
            const emailDummy = {};
            const checkout = new CheckoutService(gatewayStub, repositorioDummy, emailDummy);

            // Act
            const pedido = await checkout.processarPedido(carrinho, cartaoFicticio);

            // Assert
            expect(pedido).toBeNull();
        });
    });

    test('retorna o pedido salvo com o total correto para um cliente padrão', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder()
            .comUser(UserMother.umUsuarioPadrao())
            .comItens([new Item('Livro', 75), new Item('Mochila', 125)])
            .build();
        const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
        const repositorioStub = criarStubDeRepositorio();
        const emailStub = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
        const checkout = new CheckoutService(gatewayStub, repositorioStub, emailStub);

        // Act
        const pedido = await checkout.processarPedido(carrinho, cartaoFicticio);

        // Assert
        expect(pedido).toEqual({
            id: idPedidoSalvo,
            carrinho,
            totalFinal: 200,
            status: 'PROCESSADO',
        });
    });

    test('cobra R$ 180 de um cliente premium em uma compra de R$ 200', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder()
            .comUser(UserMother.umUsuarioPremium())
            .comItens([new Item('Mochila', 200)])
            .build();
        const gatewayMock = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
        const repositorioStub = criarStubDeRepositorio();
        const emailStub = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
        const checkout = new CheckoutService(gatewayMock, repositorioStub, emailStub);

        // Act
        await checkout.processarPedido(carrinho, cartaoFicticio);

        // Assert
        expect(gatewayMock.cobrar).toHaveBeenCalledTimes(1);
        expect(gatewayMock.cobrar).toHaveBeenCalledWith(180, cartaoFicticio);
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        test('envia um único e-mail com os dados do pedido premium aprovado', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPremium())
                .comItens([new Item('Mochila', 200)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositorioStub = criarStubDeRepositorio();
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkout = new CheckoutService(gatewayStub, repositorioStub, emailMock);

            // Act
            await checkout.processarPedido(carrinho, cartaoFicticio);

            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartaoFicticio);
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                `Pedido ${idPedidoSalvo} no valor de R$180`,
            );
        });
    });

    test('não salva o pedido nem envia e-mail quando o pagamento é recusado', async () => {
        // Arrange
        const carrinho = new CarrinhoBuilder().build();
        const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
        const repositorioMock = { salvar: jest.fn() };
        const emailMock = { enviarEmail: jest.fn() };
        const checkout = new CheckoutService(gatewayStub, repositorioMock, emailMock);

        // Act
        await checkout.processarPedido(carrinho, cartaoFicticio);

        // Assert
        expect(repositorioMock.salvar).not.toHaveBeenCalled();
        expect(emailMock.enviarEmail).not.toHaveBeenCalled();
    });
});
