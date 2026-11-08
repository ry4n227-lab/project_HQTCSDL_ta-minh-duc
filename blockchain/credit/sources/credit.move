module octapoint::credit;

use sui::event;

const EInvalidAmount: u64 = 0;
const EInvalidRecipient: u64 = 1;
const ENotOwner: u64 = 2;
const EWrongMerchant: u64 = 3;
const ESelfTransfer: u64 = 4;
const EAmountTooLarge: u64 = 5;
const MAX_POINTS: u64 = 2147483647;

// No store ability: external modules cannot bypass the transfer policy.
public struct PlatformCap has key { id: UID }
public struct MintCap has key { id: UID, issuer: address }
public struct Credit has key {
    id: UID,
    merchant_id: ID,
    amount: u64,
    owner: address,
}

public struct MerchantCreated has copy, drop { merchant_id: ID, issuer: address }
public struct CreditMinted has copy, drop {
    credit_id: ID, merchant_id: ID, amount: u64, recipient: address,
}
public struct CreditTransferred has copy, drop {
    credit_id: ID, merchant_id: ID, amount: u64, sender: address, recipient: address,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(PlatformCap { id: object::new(ctx) }, ctx.sender());
}

public fun create_merchant(_: &PlatformCap, issuer: address, ctx: &mut TxContext) {
    assert!(issuer != @0x0, EInvalidRecipient);
    let cap = MintCap { id: object::new(ctx), issuer };
    event::emit(MerchantCreated { merchant_id: object::id(&cap), issuer });
    transfer::transfer(cap, issuer);
}

public fun mint(cap: &MintCap, amount: u64, recipient: address, ctx: &mut TxContext) {
    assert!(ctx.sender() == cap.issuer, ENotOwner);
    assert!(amount > 0, EInvalidAmount);
    assert!(amount <= MAX_POINTS, EAmountTooLarge);
    assert!(recipient != @0x0, EInvalidRecipient);
    let credit = Credit {
        id: object::new(ctx), merchant_id: object::id(cap), amount, owner: recipient,
    };
    event::emit(CreditMinted {
        credit_id: object::id(&credit), merchant_id: credit.merchant_id, amount, recipient,
    });
    transfer::transfer(credit, recipient);
}

public fun transfer_credit(
    mut credit: Credit, expected_merchant_id: ID, recipient: address, ctx: &mut TxContext,
) {
    assert!(credit.owner == ctx.sender(), ENotOwner);
    assert!(credit.merchant_id == expected_merchant_id, EWrongMerchant);
    assert!(recipient != @0x0, EInvalidRecipient);
    assert!(recipient != credit.owner, ESelfTransfer);
    event::emit(CreditTransferred {
        credit_id: object::id(&credit), merchant_id: credit.merchant_id,
        amount: credit.amount, sender: ctx.sender(), recipient,
    });
    credit.owner = recipient;
    transfer::transfer(credit, recipient);
}

public fun amount(credit: &Credit): u64 { credit.amount }
public fun owner(credit: &Credit): address { credit.owner }
public fun merchant_id(credit: &Credit): ID { credit.merchant_id }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }
